// ─── NFT Contract addresses (same across all supported chains) ────────────────

export const NFT_CONTRACTS = {
  CONVEXO_PASSPORT: '0x2AD6aA7652C5167881b60C5bEa8713A0F0520cDD',
  LP_INDIVIDUALS:   '0xF4aA32C029CfFa6050107E65FFF6e25AA2E58554',
  LP_BUSINESS:      '0x147070275646d9Cab76Ae26e5Eb632f5A6e8024C',
  ECREDITSCORING:   '0x20Be7F2D32Ddaa7c056CC6C39415275401cdF9E7',
} as const

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
