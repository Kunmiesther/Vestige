/**
 * Arc Testnet network configuration.
 * Single source of truth — import from here everywhere.
 * https://docs.arc.io/arc/references/connect-to-arc
 */

export const ARC_TESTNET = {
  chainId: 5042002,
  chainIdHex: '0x4CE052' as const,
  name: 'Arc Testnet',
  currency: 'USDC',
  decimals: 18,
  rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL ?? 'https://rpc.testnet.arc-node.thecanteenapp.com/v1/swrm_f7116dee1c18b0cfbff8c4a4936644a4aa1ecd37b9f8c7856da9fcc7a746aed2',
  explorerUrl: 'https://testnet.arcscan.app',
  faucetUrl: 'https://faucet.circle.com',
} as const

/** Build an arcscan explorer link for a tx hash */
export function arcTxUrl(txHash: string): string {
  return `${ARC_TESTNET.explorerUrl}/tx/${txHash}`
}

/** Build an arcscan explorer link for an address */
export function arcAddressUrl(address: string): string {
  return `${ARC_TESTNET.explorerUrl}/address/${address}`
}

/** Truncate a wallet address for display: 0x1234…abcd */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return ''
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

/**
 * EIP-3085 addEthereumChain params for Arc Testnet.
 * Used when prompting MetaMask/injected wallets to add the network.
 */
export const ARC_CHAIN_PARAMS = {
  chainId: ARC_TESTNET.chainIdHex,
  chainName: ARC_TESTNET.name,
  nativeCurrency: {
    name: 'USD Coin',
    symbol: ARC_TESTNET.currency,
    decimals: ARC_TESTNET.decimals,
  },
  rpcUrls: [ARC_TESTNET.rpcUrl],
  blockExplorerUrls: [ARC_TESTNET.explorerUrl],
} as const
