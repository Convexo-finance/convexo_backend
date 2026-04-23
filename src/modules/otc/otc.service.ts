import { db } from '../../config/database'
import { env } from '../../config/env'
import { NotFoundError, ForbiddenError } from '../../shared/errors'
import { sendEmail, sendTelegram } from '../notifications/notifications.service'
import { logger } from '../../shared/logger'
import type { CreateOtcOrderInput, UpdateOtcOrderStatusInput, ListOtcOrdersInput } from './otc.schema'

// ─── Helper — try to calculate amountOut from admin-set rates (legacy) ────────

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

    const usdPair  = `${tokenIn.toUpperCase()}-USD`
    const usdRate  = await db.exchangeRate.findUnique({ where: { pair: usdPair } })
    const priceUSD = usdRate ? (parseFloat(amountIn) * usdRate.rate).toFixed(2) : null

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
  // Legacy swap format: resolve amountOut from rates
  let amountOut: string | null = null
  let priceUSD: string | null = null
  if (input.tokenIn && input.tokenOut && input.amountIn) {
    const resolved = await resolveAmountOut(input.tokenIn, input.tokenOut, input.amountIn)
    amountOut = resolved.amountOut
    priceUSD  = resolved.priceUSD
  }

  const order = await db.otcOrder.create({
    data: {
      userId,
      orderId:           input.orderId,
      orderType:         input.orderType,
      // Fiat-OTC fields
      digitalAsset:      input.digitalAsset,
      fiatCurrency:      input.fiatCurrency,
      assetAmount:       input.assetAmount,
      estimatedFiat:     input.estimatedFiat,
      rate:              input.rate,
      walletAddress:     input.walletAddress ?? walletAddress,
      frontendTimestamp: input.timestamp ? new Date(input.timestamp) : undefined,
      // Sell order bank info
      bankName:          input.bankName,
      bankAccount:       input.bankAccount,
      bankAccountType:   input.accountType,
      holderName:        input.holderName,
      accountLabel:      input.accountLabel,
      // Legacy swap fields
      tokenIn:           input.tokenIn?.toUpperCase(),
      tokenOut:          input.tokenOut?.toUpperCase(),
      amountIn:          input.amountIn,
      amountOut:         amountOut ?? undefined,
      priceUSD:          priceUSD  ?? undefined,
      network:           input.network,
      notes:             input.notes,
      status:            'PENDING',
    },
    include: { user: { include: { individualProfile: true, businessProfile: true } } },
  })

  // Notify admin via Telegram (non-blocking)
  if (env.TELEGRAM_ADMIN_CHAT_ID) {
    const isFiatOtc = !!input.digitalAsset
    const summary = isFiatOtc
      ? `${input.orderType} ${input.assetAmount} ${input.digitalAsset} ↔ ${input.estimatedFiat} ${input.fiatCurrency}`
      : `${input.amountIn} ${input.tokenIn?.toUpperCase()} → ${amountOut ?? '?'} ${input.tokenOut?.toUpperCase()}`

    sendTelegram({
      userId,
      chatId: env.TELEGRAM_ADMIN_CHAT_ID,
      text: [
        `🔄 <b>New OTC Order</b>`,
        ``,
        `Type:    <b>${input.orderType}</b>`,
        `Trade:   <code>${summary}</code>`,
        `Wallet:  <code>${input.walletAddress ?? walletAddress}</code>`,
        `OrderID: <code>${input.orderId ?? order.id}</code>`,
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
    const isFiatOtc = !!input.digitalAsset
    const direction = isFiatOtc
      ? (input.orderType === 'BUY'
          ? `Buy <b>${input.assetAmount} ${input.digitalAsset}</b> for <b>${input.estimatedFiat} ${input.fiatCurrency}</b>`
          : `Sell <b>${input.assetAmount} ${input.digitalAsset}</b> for <b>${input.estimatedFiat} ${input.fiatCurrency}</b>`)
      : (input.orderType === 'BUY'
          ? `Buy <b>${amountOut ?? '?'} ${input.tokenOut}</b> with <b>${input.amountIn} ${input.tokenIn}</b>`
          : `Sell <b>${input.amountIn} ${input.tokenIn}</b> for <b>${amountOut ?? '?'} ${input.tokenOut}</b>`)

    sendEmail({
      userId,
      to: email,
      subject: `OTC Order Received — ${input.orderType} ${input.digitalAsset ?? input.tokenIn}`,
      html: `
        <h2>Your OTC order has been received</h2>
        <p>${direction}</p>
        ${input.network ? `<p>Network: ${input.network}</p>` : ''}
        ${priceUSD ? `<p>Estimated value: <strong>$${priceUSD} USD</strong></p>` : ''}
        <p>Our team will contact you shortly to complete the transaction.</p>
        <p>Order ID: <code>${input.orderId ?? order.id}</code></p>
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
  const order = await db.otcOrder.findFirst({
    where: { OR: [{ id }, { orderId: id }] },
  })
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
  const order = await db.otcOrder.findFirst({
    where: { OR: [{ id }, { orderId: id }] },
    include: { user: { include: { individualProfile: true, businessProfile: true } } },
  })
  if (!order) throw new NotFoundError('OTC order')

  const updated = await db.otcOrder.update({
    where: { id: order.id },
    data: {
      status: input.status,
      notes:  input.notes !== undefined ? input.notes : order.notes,
    },
  })

  const email =
    order.user.individualProfile?.email ??
    order.user.businessProfile?.email

  if (email) {
    const statusLabels: Record<string, string> = {
      CONFIRMED:   '✅ Confirmed',
      IN_PROGRESS: '⏳ In Progress',
      COMPLETED:   '✅ Completed',
      CANCELLED:   '❌ Cancelled',
    }
    const tradeLabel = order.digitalAsset
      ? `${order.orderType} ${order.assetAmount} ${order.digitalAsset}`
      : `${order.orderType} ${order.amountIn} ${order.tokenIn} → ${order.amountOut ?? '?'} ${order.tokenOut}`

    sendEmail({
      userId: order.userId,
      to:     email,
      subject: `OTC Order ${statusLabels[input.status] ?? input.status}`,
      html: `
        <h2>Your OTC order status has been updated</h2>
        <p>Order: <strong>${tradeLabel}</strong></p>
        <p>New status: <strong>${statusLabels[input.status] ?? input.status}</strong></p>
        ${input.notes ? `<p>Note: ${input.notes}</p>` : ''}
        <p>Order ID: <code>${order.orderId ?? order.id}</code></p>
      `,
    }).catch((err) => logger.error({ err }, 'OTC status email failed'))
  }

  return updated
}
