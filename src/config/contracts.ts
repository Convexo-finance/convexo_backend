// ─── NFT Contract addresses ───────────────────────────────────────────────────
//
// LP/Ecreditscoring are deterministic (same on all chains via CREATE2 v3.18).
// Convexo_Passport and ReputationManager differ on ETH Sepolia (v3.19 — devMode
// expiry guard requires bytecode change → new CREATE2 address on that chain only).
//
// Pattern mirrors VAULT_FACTORY_BY_CHAIN — chain-aware map, not env vars.
// Source of truth: convexo_contracts/addresses.json

// Deterministic across all chains (v3.18)
const PASSPORT_V318  = '0x648D128c117bC83aEAAd408ab69F0E5cb6291790'
const REP_MGR_V318   = '0x50b81F36a95E1363288Ef44aD7E48A8CaCDFa349'

export const CONVEXO_PASSPORT_BY_CHAIN: Record<number, string> = {
  8453:    PASSPORT_V318,  // Base Mainnet
  130:     PASSPORT_V318,  // Unichain Mainnet
  42161:   PASSPORT_V318,  // Arbitrum One
  1:       PASSPORT_V318,  // ETH Mainnet
  84532:   PASSPORT_V318,  // Base Sepolia
  11155111:'0xCde95545f2446C2CfdDA7439493AD453014AC562', // ETH Sepolia v3.19
  1301:    PASSPORT_V318,  // Unichain Sepolia
  421614:  PASSPORT_V318,  // Arbitrum Sepolia
}

export const REPUTATION_MANAGER_BY_CHAIN: Record<number, string> = {
  8453:    REP_MGR_V318,  // Base Mainnet
  130:     REP_MGR_V318,  // Unichain Mainnet
  42161:   REP_MGR_V318,  // Arbitrum One
  1:       REP_MGR_V318,  // ETH Mainnet
  84532:   REP_MGR_V318,  // Base Sepolia
  11155111:'0x28a9b3bA5ddf3D7542a2BCC00Bc7eC72363bEB8b', // ETH Sepolia v3.19
  1301:    REP_MGR_V318,  // Unichain Sepolia
  421614:  REP_MGR_V318,  // Arbitrum Sepolia
}

// Helpers — used by reputation.service and middleware
export function getPassportAddress(chainId: number): string {
  return CONVEXO_PASSPORT_BY_CHAIN[chainId] ?? PASSPORT_V318
}

export function getReputationManagerAddress(chainId: number): string {
  return REPUTATION_MANAGER_BY_CHAIN[chainId] ?? REP_MGR_V318
}

export const NFT_CONTRACTS = {
  LP_INDIVIDUALS: '0xE244e4B2B37EA6f6453d3154da548e7f2e1e5Df3',
  LP_BUSINESS:    '0x70cFe52560Dc2DD981d2374bB6b01c2170E5597B',
  ECREDITSCORING: '0xa448Aa6bfd5bA16BBd756cAF8E2cd68b31b51D88',
} as const

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
