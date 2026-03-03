import { createPublicClient, http } from 'viem'
import { env } from '../config/env'
import { SUPPORTED_CHAINS, type SupportedChainId } from '../config/chains'

const rpcOverrides: Partial<Record<SupportedChainId, string>> = {
  8453: env.BASE_MAINNET_RPC_URL,
  84532: env.BASE_SEPOLIA_RPC_URL,
  130: env.UNICHAIN_MAINNET_RPC_URL,
  1301: env.UNICHAIN_SEPOLIA_RPC_URL,
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
