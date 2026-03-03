import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { NotFoundError, ForbiddenError, BadRequestError } from '../../shared/errors'
import type { CreateBankAccountInput, UpdateBankAccountInput } from './bank-accounts.schema'

// ─── Encryption helpers (AES-256-GCM) ────────────────────────────────────────

function getEncryptionKey(): Buffer | null {
  if (!env.ENCRYPTION_KEY) return null
  return Buffer.from(env.ENCRYPTION_KEY, 'hex')
}

function encrypt(plaintext: string): string | null {
  const key = getEncryptionKey()
  if (!key) return null

  const iv         = randomBytes(12)                              // 96-bit IV for GCM
  const cipher     = createCipheriv('aes-256-gcm', key, iv)
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag    = cipher.getAuthTag()

  // Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(encoded: string): string {
  const key = getEncryptionKey()
  if (!key) throw new BadRequestError('Encryption not configured.')

  const [ivHex, authTagHex, ciphertextHex] = encoded.split(':')
  const iv         = Buffer.from(ivHex, 'hex')
  const authTag    = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return '*'.repeat(accountNumber.length)
  return '*'.repeat(accountNumber.length - 4) + accountNumber.slice(-4)
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function listBankAccounts(userId: string) {
  return db.bankAccount.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function createBankAccount(userId: string, input: CreateBankAccountInput) {
  const masked    = maskAccountNumber(input.accountNumber)
  const encrypted = encrypt(input.accountNumber)

  // If this is set as default, unset all other defaults first
  if (input.isDefault) {
    await db.bankAccount.updateMany({
      where: { userId },
      data:  { isDefault: false },
    })
  }

  return db.bankAccount.create({
    data: {
      userId,
      accountName:            input.accountName,
      bankName:               input.bankName,
      accountNumberMasked:    masked,
      accountNumberEncrypted: encrypted,
      accountType:            input.accountType,
      currency:               input.currency,
      holderName:             input.holderName,
      isDefault:              input.isDefault ?? false,
      status:                 'PENDING',
    },
  })
}

export async function updateBankAccount(userId: string, id: string, input: UpdateBankAccountInput) {
  const account = await db.bankAccount.findUnique({ where: { id } })
  if (!account) throw new NotFoundError('Bank account')
  if (account.userId !== userId) throw new ForbiddenError()

  // If setting as default, unset other defaults first
  if (input.isDefault === true) {
    await db.bankAccount.updateMany({
      where: { userId, id: { not: id } },
      data:  { isDefault: false },
    })
  }

  return db.bankAccount.update({
    where: { id },
    data:  input,
  })
}

export async function deleteBankAccount(userId: string, id: string): Promise<void> {
  const account = await db.bankAccount.findUnique({ where: { id } })
  if (!account) throw new NotFoundError('Bank account')
  if (account.userId !== userId) throw new ForbiddenError()

  await db.bankAccount.delete({ where: { id } })
}

export async function setDefaultBankAccount(userId: string, id: string) {
  const account = await db.bankAccount.findUnique({ where: { id } })
  if (!account) throw new NotFoundError('Bank account')
  if (account.userId !== userId) throw new ForbiddenError()

  await db.bankAccount.updateMany({
    where: { userId },
    data:  { isDefault: false },
  })

  return db.bankAccount.update({
    where: { id },
    data:  { isDefault: true },
  })
}
