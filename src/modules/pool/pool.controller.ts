import type { FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../../config/env'
import { isSupportedChain, type SupportedChainId } from '../../config/chains'
import { BadRequestError } from '../../shared/errors'
import { getPoolStatus, getPoolStatusByChainId } from './pool.service'

// ─── GET /pool/status ─────────────────────────────────────────────────────────

/**
 * Returns pool status for the default configured chain (POOL_KEEPER_CHAIN_ID).
 * Reads from Redis cache first; falls back to on-chain.
 */
export async function getDefaultPoolStatus(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const chainId = env.POOL_KEEPER_CHAIN_ID
  if (!isSupportedChain(chainId)) {
    throw new BadRequestError(`Default pool chain ${chainId} is not supported`)
  }
  const status = await getPoolStatus(chainId as SupportedChainId)
  return reply.send(status)
}

// ─── GET /pool/status/:chainId ────────────────────────────────────────────────

/**
 * Returns pool status for an explicitly specified chainId.
 * Reads from Redis cache first; falls back to on-chain.
 */
export async function getChainPoolStatus(
  request: FastifyRequest<{ Params: { chainId: string } }>,
  reply: FastifyReply,
) {
  const chainId = parseInt(request.params.chainId, 10)
  if (isNaN(chainId)) {
    throw new BadRequestError('chainId must be a valid integer')
  }
  const status = await getPoolStatusByChainId(chainId)
  return reply.send(status)
}
