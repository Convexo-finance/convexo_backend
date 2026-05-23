import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { env } from '../config/env'
import { BadRequestError } from './errors'

/**
 * AES-256-GCM helpers shared across the app.
 *
 * `bank-accounts` historically used inline copies of these functions with a
 * string wire format (`iv_hex:authTag_hex:ciphertext_hex`). They're kept here
 * for compatibility (`encryptString` / `decryptString`). New code that needs to
 * encrypt binary blobs (KYB/CS document content) should use the Buffer-native
 * versions: `encryptBuffer` / `decryptBuffer`, which use a packed wire format
 * of `iv (12B) || authTag (16B) || ciphertext` to avoid hex-encoding overhead.
 *
 * Key source: `env.ENCRYPTION_KEY` (64 hex chars = 256 bits).
 */

const IV_LEN      = 12 // 96-bit IV is standard for GCM
const AUTH_TAG_LEN = 16

function getKey(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    throw new BadRequestError('Encryption not configured (ENCRYPTION_KEY missing).')
  }
  return Buffer.from(env.ENCRYPTION_KEY, 'hex')
}

// ─── String wire format (legacy / bank-accounts compatible) ───────────────────

export function encryptString(plaintext: string): string {
  const key      = getKey()
  const iv       = randomBytes(IV_LEN)
  const cipher   = createCipheriv('aes-256-gcm', key, iv)
  const enc      = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag  = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptString(encoded: string): string {
  const key   = getKey()
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new BadRequestError('Malformed encrypted string.')
  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string]
  const iv         = Buffer.from(ivHex, 'hex')
  const authTag    = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher   = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

// ─── Buffer wire format (preferred for binary content) ────────────────────────

/** Packs ciphertext as `iv || authTag || ciphertext` in a single Buffer. */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const key     = getKey()
  const iv      = randomBytes(IV_LEN)
  const cipher  = createCipheriv('aes-256-gcm', key, iv)
  const enc     = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, enc])
}

/** Unpacks `iv || authTag || ciphertext` and decrypts. Throws on tamper. */
export function decryptBuffer(blob: Buffer): Buffer {
  if (blob.length < IV_LEN + AUTH_TAG_LEN) {
    throw new BadRequestError('Encrypted blob is too short to be valid.')
  }
  const key        = getKey()
  const iv         = blob.subarray(0, IV_LEN)
  const authTag    = blob.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN)
  const ciphertext = blob.subarray(IV_LEN + AUTH_TAG_LEN)
  const decipher   = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}
