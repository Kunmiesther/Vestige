/**
 * Arc Testnet network configuration.
 * Single source of truth — import from here everywhere.
 * https://docs.arc.io/arc/references/connect-to-arc
 */

export const ARC_TESTNET = {
  chainId: 5042002,
  chainIdHex: '0x4CEF52' as const,
  name: 'Arc Testnet',
  currency: 'USDC',
  decimals: 6,
  rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL ?? 'https://rpc.testnet.arc.network',
  explorerUrl: 'https://explorer.arc.io',
  faucetUrl: 'https://faucet.circle.com',
} as const

export const ARC_USDC_CONTRACT_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const ARC_GATEWAY_WALLET_CONTRACT_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const
export const ARC_PUBLISH_PAY_TO = process.env.NEXT_PUBLIC_ARC_PUBLISH_PAY_TO ?? ARC_GATEWAY_WALLET_CONTRACT_ADDRESS
export const ARC_PUBLISH_FEE_USDC = process.env.NEXT_PUBLIC_ARC_PUBLISH_FEE_USDC ?? '0.01'

/** Build an arcscan explorer link for an address */
export function arcAddressUrl(address: string): string {
  return `${ARC_TESTNET.explorerUrl}/address/${address}`
}

/** Build an arcscan explorer link for a transaction */
export function arcTxUrl(txHash: string): string {
  return `${ARC_TESTNET.explorerUrl}/tx/${txHash}`
}

/** Build an Arc explorer link for a transaction */
export function getArcExplorerTxUrl(txHash: string): string {
  return arcTxUrl(txHash)
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
