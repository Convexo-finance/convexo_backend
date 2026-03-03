import { base, baseSepolia, mainnet, sepolia } from 'viem/chains'
import type { Chain } from 'viem'

// Unichain Mainnet (130)
export const unichainMainnet: Chain = {
  id: 130,
  name: 'Unichain Mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mainnet.unichain.org'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://unichain.blockscout.com' },
  },
}

// Unichain Sepolia (1301)
export const unichainSepolia: Chain = {
  id: 1301,
  name: 'Unichain Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia.unichain.org'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://unichain-sepolia.blockscout.com' },
  },
  testnet: true,
}

export type SupportedChainId = 130 | 8453 | 1301 | 84532 | 11155111 | 1

export const SUPPORTED_CHAINS: Record<SupportedChainId, Chain> = {
  130: unichainMainnet,
  8453: base,
  1301: unichainSepolia,
  84532: baseSepolia,
  11155111: sepolia,
  1: mainnet,
}

export const MAINNET_CHAIN_IDS: SupportedChainId[] = [130, 8453, 1]
export const TESTNET_CHAIN_IDS: SupportedChainId[] = [1301, 84532, 11155111]

export function isSupportedChain(chainId: number): chainId is SupportedChainId {
  return chainId in SUPPORTED_CHAINS
}

export function isMainnet(chainId: number): boolean {
  return MAINNET_CHAIN_IDS.includes(chainId as SupportedChainId)
}
