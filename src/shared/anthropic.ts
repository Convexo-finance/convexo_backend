import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env'
import { BadRequestError } from './errors'

/**
 * Anthropic SDK singleton. Lazy-init so the server still boots if
 * ANTHROPIC_API_KEY isn't set (the KYB custom flow checks `env.KYB_CUSTOM_FLOW`
 * before calling extraction).
 */

let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (client) return client
  if (!env.ANTHROPIC_API_KEY) {
    throw new BadRequestError(
      'Anthropic is not configured. Set ANTHROPIC_API_KEY in Railway and redeploy.',
    )
  }
  client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

export const ANTHROPIC_MODEL = env.ANTHROPIC_MODEL
