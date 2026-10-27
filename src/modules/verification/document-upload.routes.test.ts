/**
 * In-process integration tests for the direct-to-Storage upload flow.
 *
 * Real Fastify app (`buildApp()` + `app.inject`), real Postgres + Redis (disposable,
 * via TEST_DATABASE_URL / TEST_REDIS_URL), fake Supabase bucket and fake Anthropic
 * client injected through the test seams. Skipped when TEST_DATABASE_URL is unset.
 *
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/convexo_test \
 *   TEST_REDIS_URL=redis://127.0.0.1:56379 npm test
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import type Anthropic from '@anthropic-ai/sdk'
import { buildApp } from '../../app'
import { db } from '../../config/database'
import { redis } from '../../config/redis'
import { setDocumentsBucketForTests, type DocumentBucket } from '../../config/supabase'
import { setAnthropicForTests } from '../../shared/anthropic'

const enabled = Boolean(process.env.TEST_DATABASE_URL)

// ─── Fakes ────────────────────────────────────────────────────────────────────

class FakeBucket implements DocumentBucket {
  objects = new Map<string, { body: Buffer; type: string }>()
  issued  = new Set<string>()
  signedDownloads: Array<{ path: string; expiresIn: number; download?: string | boolean }> = []

  async createSignedUploadUrl(path: string) {
    this.issued.add(path)
    return {
      data:  { path, token: `tok-${path}`, signedUrl: `https://proj.supabase.co/storage/v1/object/upload/sign/documents/${path}?token=tok` },
      error: null,
    }
  }
  /** What the browser does with the signed URL. */
  put(path: string, body: Buffer, type: string) {
    assert.ok(this.issued.has(path), 'PUT to a path that was never signed')
    this.objects.set(path, { body, type })
  }
  async download(path: string) {
    const o = this.objects.get(path)
    if (!o) return { data: null, error: new Error('Object not found') }
    return { data: new Blob([new Uint8Array(o.body)], { type: o.type }), error: null }
  }
  async createSignedUrl(path: string, expiresIn: number, options?: { download?: string | boolean }) {
    this.signedDownloads.push({ path, expiresIn, download: options?.download })
    return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/documents/${path}?token=dl` }, error: null }
  }
  async remove(paths: string[]) {
    paths.forEach((p) => this.objects.delete(p))
    return { data: [], error: null }
  }
}

const fakeAnthropic = {
  messages: {
    create: async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({
          data: {
            companyName: 'ACME SAS', legalName: 'ACME S.A.S.', incorporationNumber: '123', taxNumber: '900123456',
            companyType: 'SAS', country: 'CO', city: 'Bogotá', stateRegion: 'Cundinamarca', street: 'Calle 1',
            postalCode: null, foundedYear: 2020, industry: null, repFirstName: 'Ana', repLastName: 'Diaz',
            repDocType: 'CC', repDocNumber: '1010',
          },
          confidence: { companyName: 0.95 },
        }),
      }],
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
  },
} as unknown as Anthropic

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 0x20)])
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(512)])

// ─── Harness ──────────────────────────────────────────────────────────────────

let app: FastifyInstance
let bucket: FakeBucket

async function makeUser(accountType: 'BUSINESS' | 'INDIVIDUAL', admin = false) {
  const wallet = `0x${Math.random().toString(16).slice(2).padEnd(40, '0').slice(0, 40)}`
  const user = await db.user.create({ data: { walletAddress: wallet, accountType } })
  if (admin) await db.adminRole.create({ data: { userId: user.id, role: 'VIEWER', grantedBy: 'test' } })
  const token = app.jwt.sign({
    sub: user.id, address: wallet, accountType, onboardingStep: 'NOT_STARTED',
    isAdmin: admin, adminRole: admin ? 'VIEWER' : null, jti: `jti-${user.id}`,
  })
  return { user, auth: { authorization: `Bearer ${token}` } }
}

before(async () => {
  if (!enabled) return
  app = await buildApp()
  await app.ready()
})

after(async () => {
  if (!enabled) return
  setDocumentsBucketForTests(null)
  setAnthropicForTests(null)
  await app.close()
  await db.$disconnect()
  redis.disconnect()
})

beforeEach(async () => {
  if (!enabled) return
  bucket = new FakeBucket()
  setDocumentsBucketForTests(bucket)
  setAnthropicForTests(fakeAnthropic)
  await db.$executeRawUnsafe(
    'TRUNCATE "DocumentExtraction", "SubmissionDocument", "KybSubmission", "KycSubmission", "CreditScoreRequest", "Verification", "AdminRole", "User" CASCADE',
  )
  await redis.flushdb()
})

// ─── KYB ──────────────────────────────────────────────────────────────────────

test('KYB: upload-url → PUT → confirm extracts and admin gets a signed URL', { skip: !enabled }, async () => {
  const { user, auth } = await makeUser('BUSINESS')

  const intentRes = await app.inject({
    method: 'POST', url: '/verification/kyb/upload-url', headers: auth,
    payload: { docType: 'incorporation', filename: 'Cámara de Comercio.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length },
  })
  assert.equal(intentRes.statusCode, 201, intentRes.body)
  const intent = intentRes.json()
  assert.ok(intent.submissionId && intent.documentId)
  assert.match(intent.upload.path, new RegExp(`^${user.id}/${intent.submissionId}/[0-9a-f-]{36}-Camara_de_Comercio\\.pdf$`))
  assert.equal(intent.upload.headers['content-type'], 'application/pdf')
  assert.equal(intent.upload.headers['x-upsert'], 'false')

  // Confirm before upload → 409, row stays PENDING
  const early = await app.inject({ method: 'POST', url: `/verification/kyb/documents/${intent.documentId}/confirm`, headers: auth })
  assert.equal(early.statusCode, 409, early.body)
  assert.equal((await db.submissionDocument.findUniqueOrThrow({ where: { id: intent.documentId } })).status, 'PENDING')

  // Draft hides PENDING docs
  const draftBefore = await app.inject({ method: 'GET', url: '/verification/kyb/draft', headers: auth })
  assert.equal(draftBefore.json().draft.documents.length, 0)

  bucket.put(intent.upload.path, PDF, 'application/pdf')

  const confirm = await app.inject({ method: 'POST', url: `/verification/kyb/documents/${intent.documentId}/confirm`, headers: auth })
  assert.equal(confirm.statusCode, 200, confirm.body)
  const body = confirm.json()
  assert.equal(body.status, 'COMPLETED')
  assert.equal(body.docType, 'incorporation')
  assert.equal(body.data.companyName, 'ACME SAS')

  const row = await db.submissionDocument.findUniqueOrThrow({ where: { id: intent.documentId } })
  assert.equal(row.status, 'UPLOADED')
  assert.equal(row.sha256?.length, 64)
  assert.equal((await db.kybSubmission.findUniqueOrThrow({ where: { id: intent.submissionId } })).status, 'READY_FOR_REVIEW')

  // Admin: JSON signed URL + 302 back-compat
  const admin = await makeUser('INDIVIDUAL', true)
  const urlRes = await app.inject({ method: 'GET', url: `/admin/submissions/documents/${intent.documentId}/url`, headers: admin.auth })
  assert.equal(urlRes.statusCode, 200, urlRes.body)
  assert.equal(urlRes.json().expiresIn, 60)
  assert.equal(bucket.signedDownloads[0].download, 'Cámara de Comercio.pdf')
  const redirect = await app.inject({ method: 'GET', url: `/admin/submissions/documents/${intent.documentId}`, headers: admin.auth })
  assert.equal(redirect.statusCode, 302)
  assert.match(String(redirect.headers.location), /\/object\/sign\/documents\//)

  // Non-admin cannot mint download URLs
  const denied = await app.inject({ method: 'GET', url: `/admin/submissions/documents/${intent.documentId}/url`, headers: auth })
  assert.equal(denied.statusCode, 403)
})

test('KYB: rejects non-PDF MIME, oversize, and wrong docType at intent time', { skip: !enabled }, async () => {
  const { auth } = await makeUser('BUSINESS')
  const base = { docType: 'articles', filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 100 }
  for (const payload of [
    { ...base, mimeType: 'image/png' },                 // KYB is PDF-only
    { ...base, mimeType: 'text/html' },                 // not in allowlist
    { ...base, sizeBytes: 20 * 1024 * 1024 + 1 },       // > 20 MB
    { ...base, docType: 'governmentId' },               // KYC field on KYB route
  ]) {
    const res = await app.inject({ method: 'POST', url: '/verification/kyb/upload-url', headers: auth, payload })
    assert.equal(res.statusCode, 400, `${JSON.stringify(payload)} → ${res.body}`)
  }
  assert.equal(await db.submissionDocument.count(), 0)
})

test('KYB: confirm rejects size mismatch / spoofed content and deletes the object', { skip: !enabled }, async () => {
  const { auth } = await makeUser('BUSINESS')
  const mk = async (sizeBytes: number) => (await app.inject({
    method: 'POST', url: '/verification/kyb/upload-url', headers: auth,
    payload: { docType: 'articles', filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes },
  })).json()

  // Declared one size, uploaded another
  const a = await mk(PDF.length + 1)
  bucket.put(a.upload.path, PDF, 'application/pdf')
  const ra = await app.inject({ method: 'POST', url: `/verification/kyb/documents/${a.documentId}/confirm`, headers: auth })
  assert.equal(ra.statusCode, 400)
  assert.match(ra.json().message, /size mismatch/)
  assert.equal(bucket.objects.has(a.upload.path), false)
  assert.equal(await db.submissionDocument.count({ where: { id: a.documentId } }), 0)

  // Right size, but bytes are HTML labelled as PDF
  const html = Buffer.alloc(PDF.length, 0x3c)
  const b = await mk(html.length)
  bucket.put(b.upload.path, html, 'application/pdf')
  const rb = await app.inject({ method: 'POST', url: `/verification/kyb/documents/${b.documentId}/confirm`, headers: auth })
  assert.equal(rb.statusCode, 400)
  assert.match(rb.json().message, /not a valid application\/pdf/)
})

test("users cannot confirm someone else's document", { skip: !enabled }, async () => {
  const owner = await makeUser('BUSINESS')
  const other = await makeUser('BUSINESS')
  const intent = (await app.inject({
    method: 'POST', url: '/verification/kyb/upload-url', headers: owner.auth,
    payload: { docType: 'articles', filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length },
  })).json()
  bucket.put(intent.upload.path, PDF, 'application/pdf')
  const res = await app.inject({ method: 'POST', url: `/verification/kyb/documents/${intent.documentId}/confirm`, headers: other.auth })
  assert.equal(res.statusCode, 404)
})

// ─── Credit score ─────────────────────────────────────────────────────────────

test('credit score: upload-url creates the draft with period and links the document', { skip: !enabled }, async () => {
  const { auth } = await makeUser('BUSINESS')
  const res = await app.inject({
    method: 'POST', url: '/verification/credit-score/upload-url', headers: auth,
    payload: { docType: 'balance_sheet', period: '2025', filename: 'bs.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length },
  })
  assert.equal(res.statusCode, 201, res.body)
  const { requestId, documentId } = res.json()
  const reqRow = await db.creditScoreRequest.findUniqueOrThrow({ where: { id: requestId } })
  assert.equal(reqRow.period, '2025')
  assert.equal((await db.submissionDocument.findUniqueOrThrow({ where: { id: documentId } })).creditScoreRequestId, requestId)
})

// ─── KYC ──────────────────────────────────────────────────────────────────────

test('KYC: upload images direct, confirm, then submit JSON', { skip: !enabled }, async () => {
  const { user, auth } = await makeUser('INDIVIDUAL')

  // Submit before any upload fails
  const tooEarly = await app.inject({ method: 'POST', url: '/verification/kyc/submit', headers: auth })
  assert.equal(tooEarly.statusCode, 400)

  for (const fieldName of ['governmentId', 'proofOfAddress'] as const) {
    const intent = (await app.inject({
      method: 'POST', url: '/verification/kyc/upload-url', headers: auth,
      payload: { fieldName, filename: `${fieldName}.png`, mimeType: 'image/png', sizeBytes: PNG.length },
    })).json()
    bucket.put(intent.upload.path, PNG, 'image/png')
    const c = await app.inject({ method: 'POST', url: `/verification/kyc/documents/${intent.documentId}/confirm`, headers: auth })
    assert.equal(c.statusCode, 200, c.body)
    assert.equal(c.json().status, 'UPLOADED')
  }

  const submit = await app.inject({ method: 'POST', url: '/verification/kyc/submit', headers: auth })
  assert.equal(submit.statusCode, 201, submit.body)
  assert.equal(submit.json().documentCount, 2)
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).onboardingStep, 'KYC_PENDING')

  // Business accounts cannot use the KYC route
  const biz = await makeUser('BUSINESS')
  const forbidden = await app.inject({
    method: 'POST', url: '/verification/kyc/upload-url', headers: biz.auth,
    payload: { fieldName: 'governmentId', filename: 'a.png', mimeType: 'image/png', sizeBytes: 10 },
  })
  assert.equal(forbidden.statusCode, 403)
})

// ─── Legacy ───────────────────────────────────────────────────────────────────

test('legacy multipart submits are 410 Gone; multipart is not parsed on verification routes', { skip: !enabled }, async () => {
  const { auth } = await makeUser('BUSINESS')
  for (const url of ['/verification/kyb/submit', '/verification/credit-score/submit']) {
    const res = await app.inject({ method: 'POST', url, headers: auth })
    assert.equal(res.statusCode, 410, `${url} → ${res.body}`)
  }
  const multipart = await app.inject({
    method: 'POST', url: '/verification/kyb/upload-url',
    headers: { ...auth, 'content-type': 'multipart/form-data; boundary=x' },
    payload: '--x\r\nContent-Disposition: form-data; name="docType"\r\n\r\narticles\r\n--x--\r\n',
  })
  assert.equal(multipart.statusCode, 415)

  // ...but the public Pinata route still has (scoped) multipart parsing
  const pinata = await app.inject({
    method: 'POST', url: '/documents',
    headers: { ...auth, 'content-type': 'multipart/form-data; boundary=x' },
    payload: '--x\r\nContent-Disposition: form-data; name="category"\r\n\r\nGENERAL\r\n--x--\r\n',
  })
  assert.equal(pinata.statusCode, 400)
  assert.match(pinata.json().message, /No file provided/)
})
