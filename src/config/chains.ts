import { arbitrum, arbitrumSepolia, base, baseSepolia, mainnet, sepolia } from 'viem/chains'
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

export type SupportedChainId = 8453 | 130 | 42161 | 1 | 84532 | 11155111 | 1301 | 421614

export const SUPPORTED_CHAINS: Record<SupportedChainId, Chain> = {
  8453:    base,
  130:     unichainMainnet,
  42161:   arbitrum,
  1:       mainnet,
  84532:   baseSepolia,
  11155111: sepolia,
  1301:    unichainSepolia,
  421614:  arbitrumSepolia,
}

export const MAINNET_CHAIN_IDS: SupportedChainId[] = [8453, 130, 42161, 1]
export const TESTNET_CHAIN_IDS: SupportedChainId[] = [84532, 11155111, 1301, 421614]

export const PRIMARY_MAINNET_CHAIN_ID = 8453     // Base Mainnet — ZKPassport + full protocol
export const PRIMARY_TESTNET_CHAIN_ID = 11155111 // ETH Sepolia — ZKPassport verifier + pool live

export function getPrimaryChainId(): SupportedChainId {
  const mode = process.env.NETWORK_MODE ?? 'testnet'
  return mode === 'mainnet' ? PRIMARY_MAINNET_CHAIN_ID : PRIMARY_TESTNET_CHAIN_ID
}

export function isSupportedChain(chainId: number): chainId is SupportedChainId {
  return chainId in SUPPORTED_CHAINS
}

export function isMainnet(chainId: number): boolean {
  return MAINNET_CHAIN_IDS.includes(chainId as SupportedChainId)
}
