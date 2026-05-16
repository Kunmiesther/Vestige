'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import {
  provisionCircleWallet,
  fetchWalletBalance,
  requestAccounts,
  getChainId,
  switchToArcNetwork,
  onAccountsChanged,
  onChainChanged,
  persistWallet,
  loadPersistedWallet,
  clearPersistedWallet,
  type WalletState,
  type WalletType,
} from '@/lib/wallet'
import { ARC_TESTNET } from '@/lib/arc'

// ─── Context shape ────────────────────────────────────────────────────────────

interface WalletContextValue extends WalletState {
  connectCircle: () => Promise<void>
  connectInjected: () => Promise<void>
  disconnect: () => void
  switchToArc: () => Promise<void>
  refreshBalance: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    walletType: null,
    chainId: null,
    isConnected: false,
    isConnecting: false,
    isOnArc: false,
    balance: null,
    error: null,
  })

  const cleanupRef = useRef<(() => void)[]>([])

  function patch(updates: Partial<WalletState>) {
    setState(prev => ({ ...prev, ...updates }))
  }

  const refreshBalance = useCallback(async () => {
    const s = await getStateSnapshot()
    if (!s.address) return
    try {
      const balance = await fetchWalletBalance(s.address)
      patch({ balance })
    } catch {
      // Non-critical — don't error the whole wallet state
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Retrieve current state without closure staleness
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])
  function getStateSnapshot() { return Promise.resolve(stateRef.current) }

  // Restore persisted session on mount
  useEffect(() => {
    const saved = loadPersistedWallet()
    if (!saved) return

    if (saved.walletType === 'circle') {
      patch({
        address: saved.address,
        walletType: 'circle',
        isConnected: true,
        isOnArc: true,
        chainId: ARC_TESTNET.chainId,
      })
      fetchWalletBalance(saved.address)
        .then(balance => patch({ balance }))
        .catch(() => {})
    } else if (saved.walletType === 'injected') {
      // Silently re-verify injected session
      getChainId()
        .then(chainId => {
          patch({
            address: saved.address,
            walletType: 'injected',
            isConnected: true,
            chainId,
            isOnArc: chainId === ARC_TESTNET.chainId,
          })
          return fetchWalletBalance(saved.address)
        })
        .then(balance => patch({ balance }))
        .catch(() => clearPersistedWallet())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect Circle ──────────────────────────────────────────────────────────
  const connectCircle = useCallback(async () => {
    patch({ isConnecting: true, error: null })
    try {
      const { address } = await provisionCircleWallet()
      const balance = await fetchWalletBalance(address).catch(() => '0.00')
      persistWallet(address, 'circle')
      patch({
        address,
        walletType: 'circle',
        isConnected: true,
        isOnArc: true,
        chainId: ARC_TESTNET.chainId,
        balance,
        isConnecting: false,
        error: null,
      })
    } catch (err) {
      patch({
        isConnecting: false,
        error: err instanceof Error ? err.message : 'Failed to connect Circle wallet',
      })
    }
  }, [])

  // ── Connect injected ────────────────────────────────────────────────────────
  const connectInjected = useCallback(async () => {
    patch({ isConnecting: true, error: null })
    try {
      const accounts = await requestAccounts()
      const address = accounts[0]
      if (!address) throw new Error('No accounts returned from wallet.')

      const chainId = await getChainId()
      const isOnArc = chainId === ARC_TESTNET.chainId
      const balance = await fetchWalletBalance(address).catch(() => '0.00')

      persistWallet(address, 'injected')
      patch({
        address,
        walletType: 'injected',
        isConnected: true,
        isOnArc,
        chainId,
        balance,
        isConnecting: false,
        error: null,
      })

      // Listen for account/chain changes
      const offAccounts = onAccountsChanged((accs) => {
        if (accs.length === 0) {
          clearPersistedWallet()
          patch({ address: null, isConnected: false, walletType: null, balance: null })
        } else {
          persistWallet(accs[0], 'injected')
          patch({ address: accs[0] })
        }
      })

      const offChain = onChainChanged((chainIdHex) => {
        const id = parseInt(chainIdHex, 16)
        patch({ chainId: id, isOnArc: id === ARC_TESTNET.chainId })
      })

      cleanupRef.current.push(offAccounts, offChain)
    } catch (err) {
      patch({
        isConnecting: false,
        error: err instanceof Error ? err.message : 'Failed to connect wallet',
      })
    }
  }, [])

  // ── Switch to Arc ───────────────────────────────────────────────────────────
  const switchToArc = useCallback(async () => {
    try {
      await switchToArcNetwork()
      patch({ chainId: ARC_TESTNET.chainId, isOnArc: true, error: null })
    } catch (err) {
      patch({ error: err instanceof Error ? err.message : 'Failed to switch network' })
    }
  }, [])

  // ── Disconnect ──────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    clearPersistedWallet()
    cleanupRef.current.forEach(fn => fn())
    cleanupRef.current = []
    setState({
      address: null,
      walletType: null,
      chainId: null,
      isConnected: false,
      isConnecting: false,
      isOnArc: false,
      balance: null,
      error: null,
    })
  }, [])

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => { cleanupRef.current.forEach(fn => fn()) }
  }, [])

  return (
    <WalletContext.Provider value={{
      ...state,
      connectCircle,
      connectInjected,
      switchToArc,
      disconnect,
      refreshBalance,
    }}>
      {children}
    </WalletContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
