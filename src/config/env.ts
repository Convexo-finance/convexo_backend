import { z } from 'zod'

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  APP_URL: z.string().url().default('http://localhost:3001'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Pinata
  PINATA_JWT: z.string().optional(),
  PINATA_API_KEY: z.string().optional(),
  PINATA_SECRET_KEY: z.string().optional(),
  PINATA_GATEWAY: z.string().default('lime-famous-condor-7.mypinata.cloud'),

  // Veriff
  VERIFF_API_KEY: z.string().optional(),
  VERIFF_BASE_URL: z.string().url().default('https://stationapi.veriff.com'),
  VERIFF_WEBHOOK_SECRET: z.string().optional(),

  // Sumsub
  SUMSUB_APP_TOKEN: z.string().optional(),
  SUMSUB_SECRET_KEY: z.string().optional(),
  SUMSUB_BASE_URL: z.string().url().default('https://api.sumsub.com'),
  SUMSUB_WEBHOOK_SECRET: z.string().optional(),

  // n8n
  N8N_WEBHOOK_URL: z.string().url().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional(),

  // Notifications
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default('notifications@convexo.io'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_OPS_CHAT_ID: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),

  // Blockchain RPC
  BASE_MAINNET_RPC_URL: z.string().url().optional(),
  BASE_SEPOLIA_RPC_URL: z.string().url().optional(),
  UNICHAIN_MAINNET_RPC_URL: z.string().url().default('https://mainnet.unichain.org'),
  UNICHAIN_SEPOLIA_RPC_URL: z.string().url().default('https://sepolia.unichain.org'),

  // Exchange Rates
  EXCHANGE_RATE_API_KEY: z.string().optional(),
  RATES_CACHE_TTL_SECONDS: z.coerce.number().default(600),

  // Encryption
  ENCRYPTION_KEY: z.string().length(64).optional(),

  // Admin Bootstrap
  ADMIN_WALLET_ADDRESSES: z.string().optional(),
})

function parseEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    console.error(result.error.flatten().fieldErrors)
    process.exit(1)
  }
  return result.data
}

export const env = parseEnv()

export type Env = typeof env
