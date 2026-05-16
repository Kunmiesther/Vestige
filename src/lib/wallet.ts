/**
 * Vestige wallet integration.
 *
 * Strategy: Circle developer-controlled wallets as primary.
 * Injected wallet (MetaMask etc.) as secondary / fallback.
 *
 * Circle developer-controlled wallets give the agent-linked identity
 * the hackathon judges want to see — each user gets a deterministic
 * wallet provisioned by the backend, tied to their session/identity.
 *
 * The injected wallet path is kept for users who prefer self-custody.
 */

import { ARC_TESTNET, ARC_CHAIN_PARAMS, truncateAddress } from './arc'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WalletType = 'circle' | 'injected' | null

export interface WalletState {
  address: string | null
  walletType: WalletType
  chainId: number | null
  isConnected: boolean
  isConnecting: boolean
  isOnArc: boolean
  balance: string | null  // USDC balance as formatted string
  error: string | null
}

export interface WalletActions {
  connectCircle: () => Promise<void>
  connectInjected: () => Promise<void>
  disconnect: () => void
  switchToArc: () => Promise<void>
  refreshBalance: () => Promise<void>
}

// ─── Circle developer-controlled wallet helpers ───────────────────────────────

/**
 * POST /api/wallets/provision
 * Backend creates or retrieves a Circle developer-controlled wallet for the user.
 * Returns { address, walletId }
 */
export async function provisionCircleWallet(): Promise<{ address: string; walletId: string }> {
  const res = await fetch('/api/wallets/provision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ network: 'ARC-TESTNET' }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message ?? 'Failed to provision Circle wallet'
    )
  }

  return res.json()
}

/**
 * GET /api/wallets/:address/balance
 * Returns USDC balance for the wallet address on Arc testnet.
 */
export async function fetchWalletBalance(address: string): Promise<string> {
  const res = await fetch(`/api/wallets/${address}/balance`)
  if (!res.ok) return '0.00'
  const data = await res.json() as { balance?: string }
  return data.balance ?? '0.00'
}

// ─── Injected wallet (MetaMask / EIP-1193) helpers ───────────────────────────

function getProvider(): { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum ?? null
}

export async function requestAccounts(): Promise<string[]> {
  const provider = getProvider()
  if (!provider) throw new Error('No injected wallet found. Install MetaMask or Rabby.')
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
  return accounts
}

export async function getChainId(): Promise<number> {
  const provider = getProvider()
  if (!provider) return 0
  const chainIdHex = await provider.request({ method: 'eth_chainId' }) as string
  return parseInt(chainIdHex, 16)
}

export async function switchToArcNetwork(): Promise<void> {
  const provider = getProvider()
  if (!provider) throw new Error('No injected wallet found.')

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_PARAMS.chainId }],
    })
  } catch (err: unknown) {
    // Chain not added yet — add it
    if ((err as { code?: number })?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [ARC_CHAIN_PARAMS],
      })
    } else {
      throw err
    }
  }
}

export function onAccountsChanged(callback: (accounts: string[]) => void): () => void {
  const provider = getProvider()
  if (!provider) return () => {}
  const typed = provider as unknown as { on: (event: string, cb: (accounts: string[]) => void) => void; removeListener: (event: string, cb: (accounts: string[]) => void) => void }
  typed.on('accountsChanged', callback)
  return () => typed.removeListener('accountsChanged', callback)
}

export function onChainChanged(callback: (chainId: string) => void): () => void {
  const provider = getProvider()
  if (!provider) return () => {}
  const typed = provider as unknown as { on: (event: string, cb: (chainId: string) => void) => void; removeListener: (event: string, cb: (chainId: string) => void) => void }
  typed.on('chainChanged', callback)
  return () => typed.removeListener('chainChanged', callback)
}

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = 'vestige_wallet'

interface PersistedWallet {
  address: string
  walletType: WalletType
}

export function persistWallet(address: string, walletType: WalletType): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ address, walletType }))
  } catch {}
}

export function loadPersistedWallet(): PersistedWallet | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedWallet
  } catch {
    return null
  }
}

export function clearPersistedWallet(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {}
}

export { ARC_TESTNET, truncateAddress }
