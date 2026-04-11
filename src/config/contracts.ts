// ─── NFT Contract addresses — v3.18 (deterministic via CREATE2, same on all chains) ──

export const NFT_CONTRACTS = {
  CONVEXO_PASSPORT: '0x648D128c117bC83aEAAd408ab69F0E5cb6291790',
  LP_INDIVIDUALS:   '0xE244e4B2B37EA6f6453d3154da548e7f2e1e5Df3',
  LP_BUSINESS:      '0x70cFe52560Dc2DD981d2374bB6b01c2170E5597B',
  ECREDITSCORING:   '0xa448Aa6bfd5bA16BBd756cAF8E2cd68b31b51D88',
} as const

export const REPUTATION_MANAGER = '0x50b81F36a95E1363288Ef44aD7E48A8CaCDFa349'

// vault_factory differs per chain (passport_gated_hook prefix constraint)
export const VAULT_FACTORY_BY_CHAIN: Record<number, string> = {
  8453:    '0x8E9dC18eFBD99A059785f388cb21A901C0b50698', // Base Mainnet
  130:     '0xF77816C65769FeC9a3B35A8DC1818DeE1185A283', // Unichain Mainnet
  84532:   '0x40Fa2aCCd9eb44ad154Da2ca84519E899D8E22Ae', // Base Sepolia
  11155111:'0x3D0290F255D4eB1EFe1384618a827C2E26b0df67', // Ethereum Sepolia
  1301:    '0x794F7434e43d561D847008f39994b0215c489B3D', // Unichain Sepolia
  421614:  '0x35a9d48ea707a30bae26501c491f86641f6c003d', // Arbitrum Sepolia
  42161:   '0x0000000000000000000000000000000000000000', // Arbitrum One (pending)
}

// ─── Minimal ERC-721 ABI (balanceOf only) ────────────────────────────────────

export const ERC721_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
