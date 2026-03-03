import { Resend } from 'resend'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { logger } from '../../shared/logger'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

// ─── Email ────────────────────────────────────────────────────────────────────

interface SendEmailOptions {
  userId: string
  to: string
  subject: string
  html: string
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (!resend) {
    logger.warn('Resend not configured — skipping email to ' + opts.to)
    return
  }

  let externalId: string | undefined
  let status = 'sent'
  let error: string | undefined

  try {
    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })
    externalId = result.data?.id
  } catch (err) {
    status = 'failed'
    error = err instanceof Error ? err.message : String(err)
    logger.error({ err, to: opts.to }, 'Email send failed')
  }

  await db.notificationLog.create({
    data: {
      userId: opts.userId,
      channel: 'EMAIL',
      subject: opts.subject,
      body: opts.html,
      recipient: opts.to,
      status,
      externalId,
      error,
    },
  })
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

interface SendTelegramOptions {
  userId: string
  chatId: string
  text: string
}

export async function sendTelegram(opts: SendTelegramOptions): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn('Telegram not configured — skipping message')
    return
  }

  let externalId: string | undefined
  let status = 'sent'
  let error: string | undefined

  try {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: opts.text,
        parse_mode: 'HTML',
      }),
    })
    const data = (await response.json()) as { ok: boolean; result?: { message_id: number } }
    if (data.ok) {
      externalId = String(data.result?.message_id)
    } else {
      throw new Error('Telegram API returned ok: false')
    }
  } catch (err) {
    status = 'failed'
    error = err instanceof Error ? err.message : String(err)
    logger.error({ err }, 'Telegram send failed')
  }

  await db.notificationLog.create({
    data: {
      userId: opts.userId,
      channel: 'TELEGRAM',
      subject: 'Telegram Message',
      body: opts.text,
      recipient: opts.chatId,
      status,
      externalId,
      error,
    },
  })
}

// ─── Pre-built notification templates ─────────────────────────────────────────

export async function notifyVerificationApproved(
  userId: string,
  email: string,
  verificationType: string,
): Promise<void> {
  const typeLabels: Record<string, string> = {
    HUMANITY: 'Humanity (ZKPassport)',
    KYC_INDIVIDUAL: 'KYC — Limited Partner Individual',
    KYB_BUSINESS: 'KYB — Limited Partner Business',
    CREDIT_SCORE: 'Credit Score Evaluation',
  }
  const label = typeLabels[verificationType] ?? verificationType

  await sendEmail({
    userId,
    to: email,
    subject: `✅ ${label} — Verification Approved`,
    html: `
      <h2>Your verification has been approved</h2>
      <p>Your <strong>${label}</strong> verification has been approved on Convexo.</p>
      <p>Your NFT credential will be minted shortly, which will unlock new features on the platform.</p>
      <p><a href="${env.FRONTEND_URL}/digital-id">View your Digital ID →</a></p>
    `,
  })
}

export async function notifyVerificationRejected(
  userId: string,
  email: string,
  verificationType: string,
  reason?: string,
): Promise<void> {
  const typeLabels: Record<string, string> = {
    HUMANITY: 'Humanity (ZKPassport)',
    KYC_INDIVIDUAL: 'KYC — Limited Partner Individual',
    KYB_BUSINESS: 'KYB — Limited Partner Business',
    CREDIT_SCORE: 'Credit Score Evaluation',
  }
  const label = typeLabels[verificationType] ?? verificationType

  await sendEmail({
    userId,
    to: email,
    subject: `❌ ${label} — Verification Rejected`,
    html: `
      <h2>Verification not approved</h2>
      <p>Your <strong>${label}</strong> verification was not approved on Convexo.</p>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
      <p>You may resubmit after reviewing the requirements.</p>
      <p><a href="${env.FRONTEND_URL}/digital-id">Return to Digital ID →</a></p>
    `,
  })
}

export async function notifyAdminVerificationReady(
  userId: string,
  walletAddress: string,
  verificationType: string,
): Promise<void> {
  if (!env.TELEGRAM_ADMIN_CHAT_ID) return

  await sendTelegram({
    userId,
    chatId: env.TELEGRAM_ADMIN_CHAT_ID,
    text: `🆕 <b>Verification Ready for Review</b>\n\nType: <code>${verificationType}</code>\nWallet: <code>${walletAddress}</code>\nUser ID: <code>${userId}</code>\n\nReview at ${env.APP_URL}/admin/verifications`,
  })
}

export async function notifyAdminCreditScoreSubmission(
  userId: string,
  walletAddress: string,
  requestId: string,
): Promise<void> {
  if (!env.TELEGRAM_ADMIN_CHAT_ID) return

  await sendTelegram({
    userId,
    chatId: env.TELEGRAM_ADMIN_CHAT_ID,
    text: `📊 <b>Credit Score Submission</b>\n\nRequest ID: <code>${requestId}</code>\nWallet: <code>${walletAddress}</code>\nUser ID: <code>${userId}</code>\n\nSent to n8n for processing.`,
  })
}

export async function notifyCreditScoreResult(
  userId: string,
  email: string,
  approved: boolean,
  score: number,
  rating: string,
  maxCreditLimit?: string,
  rejectionReason?: string,
): Promise<void> {
  if (approved) {
    await sendEmail({
      userId,
      to: email,
      subject: '✅ Credit Score Approved — Tier 3 Unlocked',
      html: `
        <h2>Your Credit Score Evaluation is Approved!</h2>
        <p>Score: <strong>${score}</strong> (${rating})</p>
        ${maxCreditLimit ? `<p>Maximum Credit Limit: <strong>$${maxCreditLimit} USDC</strong></p>` : ''}
        <p>Your Ecreditscoring NFT will be minted shortly, unlocking vault creation.</p>
        <p><a href="${env.FRONTEND_URL}/digital-id/credit-score">View Credit Score →</a></p>
      `,
    })
  } else {
    await sendEmail({
      userId,
      to: email,
      subject: '❌ Credit Score Evaluation — Not Approved',
      html: `
        <h2>Credit Score Evaluation Result</h2>
        <p>Score: <strong>${score}</strong> (${rating})</p>
        ${rejectionReason ? `<p>Reason: ${rejectionReason}</p>` : ''}
        <p>You may resubmit after 90 days with updated financial documents.</p>
        <p><a href="${env.FRONTEND_URL}/digital-id/credit-score">Return to Credit Score →</a></p>
      `,
    })
  }

  // Notify admin to mint NFT if approved
  if (approved && env.TELEGRAM_ADMIN_CHAT_ID) {
    await sendTelegram({
      userId,
      chatId: env.TELEGRAM_ADMIN_CHAT_ID,
      text: `✅ <b>Credit Score APPROVED — Mint NFT</b>\n\nScore: ${score} (${rating})\nCredit Limit: $${maxCreditLimit} USDC\nUser ID: <code>${userId}</code>\n\nMint at ${env.APP_URL}/admin/credit-score-requests`,
    })
  }
}
