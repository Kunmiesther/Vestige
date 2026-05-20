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
import { useRouter } from 'next/navigation'
import {
  provisionCircleWallet,
  completePendingCircleLogin,
  hasPendingCircleLoginRecovery,
  getPersistedCircleWallet,
  fetchWalletBalance,
  requestAccounts,
  getChainId,
  switchToArcNetwork,
  onAccountsChanged,
  onChainChanged,
  persistWallet,
  loadPersistedWallet,
  clearPersistedWallet,
  restoreWalletPortfolioState,
  type WalletState,
  type SelfCustodyConnectorId,
} from '@/lib/wallet'
import { ARC_TESTNET } from '@/lib/arc'

interface WalletContextValue extends WalletState {
  connectCircle: () => Promise<boolean>
  connectInjected: (connectorId: SelfCustodyConnectorId) => Promise<boolean>
  disconnect: () => void
  switchToArc: () => Promise<void>
  refreshBalance: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
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
  const injectedConnectorRef = useRef<SelfCustodyConnectorId | null>(null)
  const stateRef = useRef(state)

  function patch(updates: Partial<WalletState>) {
    setState(prev => ({ ...prev, ...updates }))
  }

  useEffect(() => {
    stateRef.current = state
  }, [state])

  function getStateSnapshot() {
    return Promise.resolve(stateRef.current)
  }

  const refreshBalance = useCallback(async () => {
    const s = await getStateSnapshot()
    if (!s.address) return
    try {
      const balance = await fetchWalletBalance(s.address)
      patch({ balance })
    } catch {
      // Balance refresh is non-critical for wallet connection state.
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false

    async function restore() {
      const saved = loadPersistedWallet()

      if (hasPendingCircleLoginRecovery()) {
        try {
          patch({ isConnecting: true, error: null })
          const completed = await completePendingCircleLogin()
          if (cancelled) return

          if (completed) {
            console.info('[vestige:wallet]', { step: 'circle-redirect-complete', address: completed.address })
            const balance = await fetchWalletBalance(completed.address).catch(() => '0.00')
            persistWallet(completed.address, 'circle')
            await restoreWalletPortfolioState().catch(() => null)
            patch({
              address: completed.address,
              walletType: 'circle',
              isConnected: true,
              isOnArc: true,
              chainId: ARC_TESTNET.chainId,
              balance,
              isConnecting: false,
              error: null,
            })

            if (completed.returnPath && completed.returnPath !== window.location.pathname) {
              router.replace(completed.returnPath)
            }
            return
          }
        } catch (err) {
          if (!cancelled) {
            console.error('[vestige:wallet]', { step: 'circle-redirect-failed', error: err instanceof Error ? err.message : err })
            patch({
              isConnecting: false,
              error: err instanceof Error ? err.message : 'Failed to complete Circle login',
            })
          }
          return
        }
      }

      if (!saved) return

      patch({ isConnecting: true, error: null })

      if (saved.walletType === 'circle') {
        const restored = await getPersistedCircleWallet().catch((err) => {
          console.error('[vestige:wallet]', { step: 'circle-session-restore-failed', error: err instanceof Error ? err.message : err })
          return null
        })
        if (cancelled) return

        if (!restored) {
          clearPersistedWallet()
          patch({ isConnecting: false })
          return
        }

        const balance = await fetchWalletBalance(restored.address).catch(() => '0.00')
        persistWallet(restored.address, 'circle')
        await restoreWalletPortfolioState().catch(() => null)
        patch({
          address: restored.address,
          walletType: 'circle',
          isConnected: true,
          isOnArc: true,
          chainId: ARC_TESTNET.chainId,
          balance,
          isConnecting: false,
          error: null,
        })
        return
      }

      if (saved.walletType === 'injected') {
        getChainId()
          .then(chainId => {
            if (cancelled) return null
            patch({
              address: saved.address,
              walletType: 'injected',
              isConnected: true,
              chainId,
              isOnArc: chainId === ARC_TESTNET.chainId,
              isConnecting: false,
            })
            return fetchWalletBalance(saved.address)
          })
          .then(balance => {
            if (!cancelled && balance) patch({ balance })
          })
          .catch(() => {
            clearPersistedWallet()
            if (!cancelled) patch({ isConnecting: false })
          })
      }
    }

    restore()
    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const connectCircle = useCallback(async () => {
    patch({ isConnecting: true, error: null })
    try {
      const { address } = await provisionCircleWallet()
      const balance = await fetchWalletBalance(address).catch(() => '0.00')
      persistWallet(address, 'circle')
      await restoreWalletPortfolioState().catch(() => null)
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
      return true
    } catch (err) {
      patch({
        isConnecting: false,
        error: err instanceof Error ? err.message : 'Failed to connect Circle wallet',
      })
      return false
    }
  }, [])

  const connectInjected = useCallback(async (connectorId: SelfCustodyConnectorId) => {
    patch({ isConnecting: true, error: null })
    try {
      const accounts = await requestAccounts(connectorId)
      const address = accounts[0]
      if (!address) throw new Error('No accounts returned from wallet.')

      const chainId = await getChainId(connectorId)
      const isOnArc = chainId === ARC_TESTNET.chainId
      const balance = await fetchWalletBalance(address).catch(() => '0.00')

      injectedConnectorRef.current = connectorId
      persistWallet(address, 'injected')
      await restoreWalletPortfolioState().catch(() => null)
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

      const offAccounts = onAccountsChanged((accs) => {
        if (accs.length === 0) {
          clearPersistedWallet()
          injectedConnectorRef.current = null
          patch({ address: null, isConnected: false, walletType: null, balance: null })
        } else {
          persistWallet(accs[0], 'injected')
          patch({ address: accs[0] })
        }
      }, connectorId)

      const offChain = onChainChanged((chainIdHex) => {
        const id = parseInt(chainIdHex, 16)
        patch({ chainId: id, isOnArc: id === ARC_TESTNET.chainId })
      }, connectorId)

      cleanupRef.current.push(offAccounts, offChain)
      return true
    } catch (err) {
      patch({
        isConnecting: false,
        error: err instanceof Error ? err.message : 'Failed to connect wallet',
      })
      return false
    }
  }, [])

  const switchToArc = useCallback(async () => {
    try {
      await switchToArcNetwork(injectedConnectorRef.current ?? undefined)
      patch({ chainId: ARC_TESTNET.chainId, isOnArc: true, error: null })
    } catch (err) {
      patch({ error: err instanceof Error ? err.message : 'Failed to switch network' })
    }
  }, [])

  const disconnect = useCallback(() => {
    clearPersistedWallet()
    injectedConnectorRef.current = null
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

  useEffect(() => {
    return () => {
      cleanupRef.current.forEach(fn => fn())
    }
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

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
