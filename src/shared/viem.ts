import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { env } from '../config/env'
import { SUPPORTED_CHAINS, type SupportedChainId } from '../config/chains'

const rpcOverrides: Partial<Record<SupportedChainId, string>> = {
  8453:    env.BASE_MAINNET_RPC_URL,
  84532:   env.BASE_SEPOLIA_RPC_URL,
  130:     env.UNICHAIN_MAINNET_RPC_URL,
  1301:    env.UNICHAIN_SEPOLIA_RPC_URL,
  42161:   env.ARBITRUM_RPC_URL,
  421614:  env.ARBITRUM_SEPOLIA_RPC_URL,
}

// Lazy-initialized public clients per chain
const clientCache = new Map<SupportedChainId, ReturnType<typeof createPublicClient>>()

export function getPublicClient(chainId: SupportedChainId) {
  if (!clientCache.has(chainId)) {
    const chain = SUPPORTED_CHAINS[chainId]
    const rpcUrl = rpcOverrides[chainId] ?? chain.rpcUrls.default.http[0]
    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    })
    clientCache.set(chainId, client)
  }
  return clientCache.get(chainId)!
}

export function getDefaultClient() {
  return getPublicClient(8453) // Base Mainnet default
}

// ─── Keeper account (singleton) ───────────────────────────────────────────────

let _keeperAccount: ReturnType<typeof privateKeyToAccount> | null = null

/**
 * Returns the keeper PrivateKeyAccount derived from KEEPER_PRIVATE_KEY.
 * Throws if the env var is missing.
 */
export function getKeeperAccount(): ReturnType<typeof privateKeyToAccount> {
  if (_keeperAccount) return _keeperAccount
  const privateKey = (env as unknown as Record<string, string>).KEEPER_PRIVATE_KEY as `0x${string}`
  if (!privateKey) {
    throw new Error('KEEPER_PRIVATE_KEY env var is not set')
  }
  _keeperAccount = privateKeyToAccount(privateKey)
  return _keeperAccount
}

// Lazy-initialized keeper wallet clients per chain
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const keeperClientCache = new Map<SupportedChainId, any>()

/**
 * Returns a viem WalletClient for the keeper account on the given chain.
 * Requires KEEPER_PRIVATE_KEY env var (0x-prefixed 32-byte hex).
 */
export function getKeeperWalletClient(chainId: SupportedChainId) {
  if (!keeperClientCache.has(chainId)) {
    const account = getKeeperAccount()
    const chain = SUPPORTED_CHAINS[chainId]
    const rpcUrl = rpcOverrides[chainId] ?? chain.rpcUrls.default.http[0]
    const client = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    })
    keeperClientCache.set(chainId, client)
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return keeperClientCache.get(chainId)!
}
