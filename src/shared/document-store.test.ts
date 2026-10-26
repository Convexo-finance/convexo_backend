/**
 * Pure helpers — no DB, no network.  Run: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { safeObjectName, buildStoragePath, sniffMime, uploadIntentBodySchema, MAX_DOC_BYTES } from './document-store'

test('safeObjectName strips paths, accents and unsafe characters', () => {
  assert.equal(safeObjectName('Estados Financieros 2025 (final).pdf'), 'Estados_Financieros_2025_final_.pdf')
  assert.equal(safeObjectName('../../etc/passwd'), 'passwd')
  assert.equal(safeObjectName('C:\\Users\\me\\Cámara de Comercio.pdf'), 'Camara_de_Comercio.pdf')
  assert.equal(safeObjectName('...'), 'document')
  assert.equal(safeObjectName('a'.repeat(300) + '.pdf').length, 100)
  assert.ok(safeObjectName('a'.repeat(300) + '.pdf').endsWith('.pdf'))
})

test('buildStoragePath is <userId>/<parentId>/<uuid>-<safeName>', () => {
  const p = buildStoragePath('user1', 'sub1', 'my file.pdf')
  assert.match(p, /^user1\/sub1\/[0-9a-f-]{36}-my_file\.pdf$/)
  assert.notEqual(p, buildStoragePath('user1', 'sub1', 'my file.pdf'))
})

test('sniffMime recognises PDF / JPEG / PNG magic bytes only', () => {
  assert.equal(sniffMime(Buffer.from('%PDF-1.7\n...')), 'application/pdf')
  assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), 'image/jpeg')
  assert.equal(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])), 'image/png')
  assert.equal(sniffMime(Buffer.from('<html>%PDF-')), null)
  assert.equal(sniffMime(Buffer.alloc(0)), null)
})

test('upload intent body enforces MIME allowlist and 20 MB cap', () => {
  assert.ok(uploadIntentBodySchema.safeParse({ filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 }).success)
  assert.equal(uploadIntentBodySchema.safeParse({ filename: 'a.exe', mimeType: 'application/x-msdownload', sizeBytes: 10 }).success, false)
  assert.equal(uploadIntentBodySchema.safeParse({ filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: MAX_DOC_BYTES + 1 }).success, false)
  assert.equal(uploadIntentBodySchema.safeParse({ filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 0 }).success, false)
  assert.equal(uploadIntentBodySchema.safeParse({ filename: '', mimeType: 'application/pdf', sizeBytes: 1 }).success, false)
})
