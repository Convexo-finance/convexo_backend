import { db } from '../../config/database'
import { env } from '../../config/env'
import { NotFoundError, ForbiddenError } from '../../shared/errors'
import { sendEmail, sendTelegram } from '../notifications/notifications.service'
import { logger } from '../../shared/logger'
import type { CreateOtcOrderInput, UpdateOtcOrderStatusInput, ListOtcOrdersInput } from './otc.schema'

// ─── Helper — try to calculate amountOut from admin-set rates ─────────────────

async function resolveAmountOut(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
): Promise<{ amountOut: string | null; priceUSD: string | null }> {
  try {
    const pair = `${tokenIn.toUpperCase()}-${tokenOut.toUpperCase()}`
    const rate = await db.exchangeRate.findUnique({ where: { pair } })
    if (!rate) return { amountOut: null, priceUSD: null }

    const amountOut = (parseFloat(amountIn) * rate.rate).toFixed(6)

    // Resolve USD price if rate is USD-based
    const usdPair   = `${tokenIn.toUpperCase()}-USD`
    const usdRate   = await db.exchangeRate.findUnique({ where: { pair: usdPair } })
    const priceUSD  = usdRate ? (parseFloat(amountIn) * usdRate.rate).toFixed(2) : null

    return { amountOut, priceUSD }
  } catch {
    return { amountOut: null, priceUSD: null }
  }
}

// ─── User — create OTC order ──────────────────────────────────────────────────

export async function createOtcOrder(
  userId: string,
  walletAddress: string,
  input: CreateOtcOrderInput,
) {
  const { amountOut, priceUSD } = await resolveAmountOut(
    input.tokenIn,
    input.tokenOut,
    input.amountIn,
  )

  const order = await db.otcOrder.create({
    data: {
      userId,
      orderType: input.orderType,
      tokenIn:   input.tokenIn.toUpperCase(),
      tokenOut:  input.tokenOut.toUpperCase(),
      amountIn:  input.amountIn,
      amountOut: amountOut ?? undefined,
      priceUSD:  priceUSD  ?? undefined,
      network:   input.network,
      notes:     input.notes,
      status:    'PENDING',
    },
    include: { user: { include: { individualProfile: true, businessProfile: true } } },
  })

  // Notify admin via Telegram (non-blocking)
  if (env.TELEGRAM_ADMIN_CHAT_ID) {
    const rateInfo = amountOut
      ? `Rate: 1 ${input.tokenIn} = ${(parseFloat(amountOut) / parseFloat(input.amountIn)).toFixed(6)} ${input.tokenOut}`
      : 'Rate: not configured for this pair'

    sendTelegram({
      userId,
      chatId: env.TELEGRAM_ADMIN_CHAT_ID,
      text: [
        `🔄 <b>New OTC Order</b>`,
        ``,
        `Type:    <b>${input.orderType}</b>`,
        `From:    <code>${input.amountIn} ${input.tokenIn.toUpperCase()}</code>`,
        `To:      <code>${amountOut ?? '?'} ${input.tokenOut.toUpperCase()}</code>`,
        `Network: <code>${input.network}</code>`,
        `${rateInfo}`,
        `Wallet:  <code>${walletAddress}</code>`,
        `OrderID: <code>${order.id}</code>`,
        ``,
        `Review: ${env.APP_URL}/admin/otc`,
      ].join('\n'),
    }).catch((err) => logger.error({ err }, 'OTC Telegram notify failed'))
  }

  // Notify user via email if available
  const email =
    order.user.individualProfile?.email ??
    order.user.businessProfile?.email

  if (email) {
    const direction = input.orderType === 'BUY'
      ? `Buy <b>${amountOut ?? '?'} ${input.tokenOut}</b> with <b>${input.amountIn} ${input.tokenIn}</b>`
      : `Sell <b>${input.amountIn} ${input.tokenIn}</b> for <b>${amountOut ?? '?'} ${input.tokenOut}</b>`

    sendEmail({
      userId,
      to: email,
      subject: `OTC Order Received — ${input.orderType} ${input.tokenIn}/${input.tokenOut}`,
      html: `
        <h2>Your OTC order has been received</h2>
        <p>${direction}</p>
        <p>Network: ${input.network}</p>
        ${priceUSD ? `<p>Estimated value: <strong>$${priceUSD} USD</strong></p>` : ''}
        <p>Our team will contact you shortly to complete the transaction.</p>
        <p>Order ID: <code>${order.id}</code></p>
      `,
    }).catch((err) => logger.error({ err }, 'OTC email notify failed'))
  }

  // Mark notifications sent
  await db.otcOrder.update({
    where: { id: order.id },
    data: {
      telegramSent: !!env.TELEGRAM_ADMIN_CHAT_ID,
      emailSent:    !!email,
    },
  })

  return order
}

// ─── User — list own orders ───────────────────────────────────────────────────

export async function listMyOtcOrders(userId: string, query: ListOtcOrdersInput) {
  const where: Record<string, unknown> = { userId }
  if (query.status) where['status'] = query.status

  const [items, total] = await Promise.all([
    db.otcOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
    }),
    db.otcOrder.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

// ─── User — get single order ──────────────────────────────────────────────────

export async function getMyOtcOrder(userId: string, id: string) {
  const order = await db.otcOrder.findUnique({ where: { id } })
  if (!order) throw new NotFoundError('OTC order')
  if (order.userId !== userId) throw new ForbiddenError()
  return order
}

// ─── Admin — list all orders ──────────────────────────────────────────────────

export async function listAllOtcOrders(query: ListOtcOrdersInput) {
  const where: Record<string, unknown> = {}
  if (query.status) where['status'] = query.status

  const [items, total] = await Promise.all([
    db.otcOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
      include: {
        user: {
          select: {
            walletAddress: true,
            individualProfile: { select: { firstName: true, lastName: true, email: true } },
            businessProfile:   { select: { companyName: true, email: true } },
          },
        },
      },
    }),
    db.otcOrder.count({ where }),
  ])

  return { items, total, limit: query.limit, offset: query.offset }
}

// ─── Admin — update order status ─────────────────────────────────────────────

export async function updateOtcOrderStatus(
  id: string,
  input: UpdateOtcOrderStatusInput,
) {
  const order = await db.otcOrder.findUnique({
    where: { id },
    include: { user: { include: { individualProfile: true, businessProfile: true } } },
  })
  if (!order) throw new NotFoundError('OTC order')

  const updated = await db.otcOrder.update({
    where: { id },
    data: {
      status: input.status,
      notes:  input.notes !== undefined ? input.notes : order.notes,
    },
  })

  // Notify user of status change
  const email =
    order.user.individualProfile?.email ??
    order.user.businessProfile?.email

  if (email) {
    const statusLabels: Record<string, string> = {
      IN_PROGRESS: '⏳ In Progress',
      COMPLETED:   '✅ Completed',
      CANCELLED:   '❌ Cancelled',
    }
    sendEmail({
      userId: order.userId,
      to:     email,
      subject: `OTC Order ${statusLabels[input.status] ?? input.status}`,
      html: `
        <h2>Your OTC order status has been updated</h2>
        <p>Order: <strong>${order.orderType} ${order.amountIn} ${order.tokenIn} → ${order.amountOut ?? '?'} ${order.tokenOut}</strong></p>
        <p>New status: <strong>${statusLabels[input.status] ?? input.status}</strong></p>
        ${input.notes ? `<p>Note: ${input.notes}</p>` : ''}
        <p>Order ID: <code>${order.id}</code></p>
      `,
    }).catch((err) => logger.error({ err }, 'OTC status email failed'))
  }

  return updated
}
