'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from '@/contexts/WalletContext'
import { WalletModal } from './WalletModal'
import { getCctpBridgeStatus, getCctpQuote, submitCctpTransfer, ApiError, type CctpBridgeStatusResponse } from '@/lib/api'
import { loadCircleSession } from '@/lib/wallet'
import { ARC_TESTNET, truncateAddress } from '@/lib/arc'
import { cctpChainLabel, estimateBridgeCompletionMinutes } from '@/lib/cctp/config'
import { loadBridgeHistory, upsertBridgeHistory, type BridgeHistoryEntry, type BridgeMode, type BridgeTimelineState } from '@/lib/cctp/history'

export function WalletButton() {
  const { address, isConnected, isConnecting, isOnArc, walletType, balance, switchToArc, disconnect, refreshBalance, applyLocalBalanceCredit } = useWallet()
  const [showModal, setShowModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showBridge, setShowBridge] = useState(false)
  const [copied, setCopied] = useState(false)
  const modal = showModal ? <WalletModal onClose={() => setShowModal(false)} /> : null
  const bridgeModal = showBridge && address ? <BridgeModal address={address} onClose={() => setShowBridge(false)} onComplete={refreshBalance} onSimulatedCredit={applyLocalBalanceCredit} /> : null

  async function copyAddress() {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  // Not connected
  if (!isConnected && !isConnecting) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--violet)',
            background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
            padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
            transition: 'background .15s',
          }}
        >Connect wallet</button>
        {modal}
        {bridgeModal}
      </>
    )
  }

  // Connecting
  if (isConnecting) {
    return (
      <>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
        border: '1px solid var(--border)', padding: '5px 14px', borderRadius: 20,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
        Connecting…
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
      {modal}
      {bridgeModal}
      </>
    )
  }

  // Wrong network warning
  if (!isOnArc && walletType === 'injected') {
    return (
      <button
        onClick={switchToArc}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--ember)',
          background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.25)',
          padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
          animation: 'pulse 2s ease-in-out infinite',
        }}
      >
        ⚠ Switch to Arc
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}`}</style>
      </button>
    )
  }

  // Connected — show address with dropdown
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(d => !d)}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
          color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)', padding: '5px 14px',
          borderRadius: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          transition: 'border-color .15s',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: 'var(--lime)',
          boxShadow: '0 0 6px rgba(204,255,0,0.5)',
          flexShrink: 0,
        }} />
        {address ? truncateAddress(address) : '—'}
        {balance && (
          <span className="wallet-balance-text" style={{ color: 'var(--text-tertiary)', borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
            {parseFloat(balance).toFixed(2)} USDC
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          {/* Backdrop */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowDropdown(false)} />

          {/* Dropdown */}
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 99,
            background: 'var(--bg-card)', border: '1px solid var(--border-hover)',
            borderRadius: 'var(--radius-lg)', padding: '12px 0', minWidth: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {/* Address */}
            <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid var(--border)' }}>
              <div className="mono-label" style={{ marginBottom: 4 }}>
                {walletType === 'circle' ? 'Circle Wallet' : 'Browser Wallet'}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                  wordBreak: 'break-all', lineHeight: 1.5, minWidth: 0, flex: 1,
                }}>{address}</div>
                {address && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void copyAddress()
                    }}
                    aria-label="Copy wallet address"
                    title="Copy wallet address"
                    style={{
                      flexShrink: 0,
                      background: copied ? 'var(--lime-dim)' : 'rgba(255,255,255,0.03)',
                      border: copied ? '1px solid var(--lime-border)' : '1px solid var(--border)',
                      borderRadius: 4,
                      color: copied ? 'var(--lime)' : 'var(--text-tertiary)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      letterSpacing: '0.06em',
                      lineHeight: 1,
                      padding: '6px 7px',
                      textTransform: 'uppercase',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span aria-hidden="true" style={{ position: 'relative', width: 10, height: 10, display: 'inline-block', flexShrink: 0 }}>
                      <span style={{
                        position: 'absolute', left: 1, top: 3, width: 6, height: 6,
                        border: `1px solid ${copied ? 'var(--lime)' : 'var(--text-tertiary)'}`,
                        borderRadius: 1,
                      }} />
                      <span style={{
                        position: 'absolute', left: 3, top: 1, width: 6, height: 6,
                        border: `1px solid ${copied ? 'var(--lime)' : 'var(--text-tertiary)'}`,
                        borderRadius: 1, background: copied ? 'var(--lime-dim)' : 'var(--bg-card)',
                      }} />
                    </span>
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Network */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono-label" style={{ marginBottom: 0 }}>Network</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--lime)',
                  background: 'var(--lime-dim)', border: '1px solid var(--lime-border)',
                  padding: '2px 8px', borderRadius: 3,
                }}>Arc Testnet</span>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
                marginTop: 4, letterSpacing: '0.04em',
              }}>Chain ID {ARC_TESTNET.chainId}</div>
            </div>

            {/* Explorer link */}
            {address && (
              <a
                href={`${ARC_TESTNET.explorerUrl}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block', padding: '10px 16px',
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                  letterSpacing: '0.04em', transition: 'color .15s',
                  borderBottom: '1px solid var(--border)',
                }}
              >View on Arcscan ↗</a>
            )}

            <a
              href={ARC_TESTNET.faucetUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', padding: '10px 16px',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                letterSpacing: '0.04em', transition: 'color .15s',
                borderBottom: '1px solid var(--border)',
              }}
            >Fund wallet</a>

            <button
              onClick={() => { setShowBridge(true); setShowDropdown(false) }}
              style={{
                display: 'block', width: '100%', padding: '10px 16px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                letterSpacing: '0.04em', transition: 'background .15s',
                borderBottom: '1px solid var(--border)',
              }}
            >Bridge USDC</button>

            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <div className="mono-label" style={{ marginBottom: 4 }}>Recent transactions</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                No local receipts yet.
              </div>
            </div>

            <button
              onClick={async () => { await refreshBalance(); setShowDropdown(false) }}
              style={{
                display: 'block', width: '100%', padding: '10px 16px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                letterSpacing: '0.04em', transition: 'background .15s',
                borderBottom: '1px solid var(--border)',
              }}
            >Refresh balance</button>

            {/* Disconnect */}
            <button
              onClick={() => { disconnect(); setShowDropdown(false) }}
              style={{
                display: 'block', width: '100%', padding: '10px 16px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
                letterSpacing: '0.04em', transition: 'background .15s',
              }}
            >Disconnect</button>
          </div>
        </>
      )}
      {bridgeModal}
    </div>
  )
}

type BridgeState = 'idle' | 'quoting' | 'pending' | 'attesting' | 'completed'

const SOURCE_CHAINS = [
  { label: 'Ethereum Sepolia', chainId: 11155111, eta: '10-20 min' },
  { label: 'Base Sepolia', chainId: 84532, eta: '8-15 min' },
  { label: 'Arbitrum Sepolia', chainId: 421614, eta: '10-18 min' },
]

const BRIDGE_TIMELINE: Array<{ state: BridgeTimelineState; label: string }> = [
  { state: 'quoted', label: 'Quote' },
  { state: 'submitted', label: 'Submit' },
  { state: 'pending', label: 'Pending' },
  { state: 'attesting', label: 'Attesting' },
  { state: 'completed', label: 'Complete' },
]

function BridgeModal({
  address,
  onClose,
  onComplete,
  onSimulatedCredit,
}: {
  address: string
  onClose: () => void
  onComplete: () => Promise<void>
  onSimulatedCredit: (amount: string) => void
}) {
  const [sourceChain, setSourceChain] = useState(SOURCE_CHAINS[0].chainId)
  const [amount, setAmount] = useState('')
  const [state, setState] = useState<BridgeState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<CctpBridgeStatusResponse | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [mode, setMode] = useState<BridgeMode>('live')
  const [history, setHistory] = useState<BridgeHistoryEntry[]>([])
  const [activeEntry, setActiveEntry] = useState<BridgeHistoryEntry | null>(null)
  const mountedRef = useRef(true)

  const isBusy = state !== 'idle' && state !== 'completed'
  const amountNumber = Number.parseFloat(amount)
  const amountInvalid = !amount || !Number.isFinite(amountNumber) || amountNumber <= 0
  const selectedChain = SOURCE_CHAINS.find(chain => chain.chainId === sourceChain) ?? SOURCE_CHAINS[0]
  const estimatedCompletion = useMemo(() => estimateBridgeCompletionMinutes(sourceChain), [sourceChain])
  const canSubmit = !configLoading && !isBusy && !amountInvalid

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false
    setHistory(loadBridgeHistory(address))
    getCctpBridgeStatus()
      .then(status => {
        if (cancelled) return
        setConfig(status)
        if (!status.configured) {
          setMode('simulation')
          setMessage(status.reason ?? 'Live CCTP is unavailable. Simulation Mode is enabled.')
        }
      })
      .catch(err => {
        if (cancelled) return
        setConfig(null)
        setMode('simulation')
        setMessage(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Bridge status unavailable. Simulation Mode is enabled.')
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false)
      })
    return () => {
      cancelled = true
      mountedRef.current = false
    }
  }, [address])

  async function startBridge() {
    if (amountInvalid) {
      setError('Enter a USDC amount.')
      return
    }

    const session = loadCircleSession()
    setError(null)
    setMessage(null)
    const entry = createBridgeEntry(mode)
    persistEntry(entry)

    try {
      if (mode === 'simulation' || !config?.configured) {
        await runSimulatedBridge(entry)
        return
      }

      setState('quoting')
      const quote = await getCctpQuote({
        fromChainId: sourceChain,
        toChainId: ARC_TESTNET.chainId,
        amount,
        recipient: address,
        walletId: session?.wallet?.id,
      })
      setMessage(quote.message)
      persistEntry({ ...entry, status: 'quoted', quoteId: quote.quoteId, message: quote.message, updatedAt: new Date().toISOString() })

      setState('pending')
      const transfer = await submitCctpTransfer({
        fromChainId: sourceChain,
        toChainId: ARC_TESTNET.chainId,
        amount,
        recipient: address,
        walletId: session?.wallet?.id,
        quoteId: quote.quoteId,
      })
      setMessage(transfer.transferId ? `${transfer.message} / ${transfer.transferId}` : transfer.message)
      const nextState = transfer.status === 'pending' ? 'attesting' : 'completed'
      setState(nextState)
      persistEntry({
        ...entry,
        quoteId: quote.quoteId,
        transferId: transfer.transferId,
        status: nextState === 'completed' ? 'completed' : 'attesting',
        message: transfer.transferId ? `${transfer.message} / ${transfer.transferId}` : transfer.message,
        updatedAt: new Date().toISOString(),
      })
      await onComplete().catch(() => undefined)
    } catch (err) {
      if (!mountedRef.current) return
      const reason = err instanceof ApiError ? `${err.code}: ${err.message}` : 'Bridge transfer failed.'
      setMode('simulation')
      setMessage(`${reason} Simulation Mode is available for demo continuity.`)
      setError(null)
      await runSimulatedBridge({ ...entry, mode: 'simulation', message: reason })
    }
  }

  function createBridgeEntry(entryMode: BridgeMode): BridgeHistoryEntry {
    const now = new Date().toISOString()
    return {
      id: `${entryMode}-${Date.now()}`,
      mode: entryMode,
      sourceChainId: sourceChain,
      destinationChainId: ARC_TESTNET.chainId,
      amount: amountNumber.toFixed(2),
      status: 'quoted',
      estimatedMinutes: estimatedCompletion,
      createdAt: now,
      updatedAt: now,
    }
  }

  function persistEntry(entry: BridgeHistoryEntry) {
    setActiveEntry(entry)
    setHistory(upsertBridgeHistory(address, entry))
  }

  async function runSimulatedBridge(entry: BridgeHistoryEntry) {
    setMode('simulation')
    setState('quoting')
    setMessage('Simulation Mode: quote prepared.')
    persistEntry({ ...entry, mode: 'simulation', status: 'quoted', message: 'Simulation quote prepared.', updatedAt: new Date().toISOString() })
    await delay(450)
    if (!mountedRef.current) return
    setState('pending')
    setMessage('Simulation Mode: transfer submitted.')
    persistEntry({ ...entry, mode: 'simulation', status: 'pending', message: 'Simulation transfer submitted.', updatedAt: new Date().toISOString() })
    await delay(650)
    if (!mountedRef.current) return
    setState('attesting')
    setMessage('Simulation Mode: attestation observed.')
    persistEntry({ ...entry, mode: 'simulation', status: 'attesting', message: 'Simulation attestation observed.', updatedAt: new Date().toISOString() })
    await delay(650)
    if (!mountedRef.current) return
    setState('completed')
    setMessage('Simulation Mode: Arc USDC credited locally.')
    const completed = {
      ...entry,
      mode: 'simulation' as const,
      status: 'completed' as const,
      transferId: entry.transferId ?? `sim-${Date.now()}`,
      message: 'Simulation completed. Local balance adjusted for demo.',
      updatedAt: new Date().toISOString(),
    }
    persistEntry(completed)
    onSimulatedCredit(amountNumber.toFixed(2))
  }

  const stateLabel: Record<BridgeState, string> = {
    idle: 'Ready',
    quoting: 'Requesting quote...',
    pending: 'Pending...',
    attesting: 'Attesting...',
    completed: 'Completed',
  }

  const statusColor = mode === 'simulation'
    ? 'var(--ember)'
    : config?.configured
      ? 'var(--lime)'
      : 'var(--text-tertiary)'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(5,5,7,0.9)', backdropFilter: 'blur(10px)',
        overflow: 'hidden',
      }}
      onClick={event => event.target === event.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 520, maxHeight: 'min(90vh, calc(100dvh - 32px))',
        background: 'var(--bg-card)', border: '1px solid var(--border-hover)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 20px 80px rgba(0,0,0,0.55)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '22px 22px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div className="mono-label" style={{ marginBottom: 8 }}>CCTP bridge</div>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                color: 'var(--text-primary)',
              }}>Bridge USDC to Arc</h2>
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: statusColor,
              background: mode === 'simulation' ? 'var(--ember-dim)' : config?.configured ? 'var(--lime-dim)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${mode === 'simulation' ? 'rgba(255,107,53,0.22)' : config?.configured ? 'var(--lime-border)' : 'var(--border)'}`,
              padding: '4px 8px', borderRadius: 3, whiteSpace: 'nowrap',
            }}>{configLoading ? 'Checking' : mode === 'simulation' ? 'Simulation Mode' : 'Live CCTP'}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontWeight: 300 }}>
            Move USDC from testnet source chains into the Arc Testnet wallet identity used by Vestige.
          </p>
        </div>

        <div style={{
          padding: '18px 22px',
          overflowY: 'auto',
          minHeight: 0,
          flex: '1 1 auto',
          overscrollBehavior: 'contain',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          {(configLoading || message || config?.reason) && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: statusColor,
              background: mode === 'simulation' ? 'var(--ember-dim)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${mode === 'simulation' ? 'rgba(255,107,53,0.22)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
            }}>
              {configLoading ? 'Checking bridge configuration...' : message ?? config?.reason}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="bridge-grid">
            <div>
              <label className="mono-label" style={{ marginBottom: 6, display: 'block' }}>Source chain</label>
              <select
                value={sourceChain}
                onChange={event => setSourceChain(Number(event.target.value))}
                disabled={isBusy || configLoading}
                style={fieldStyle}
              >
                {SOURCE_CHAINS.map(chain => (
                  <option key={chain.chainId} value={chain.chainId}>{chain.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mono-label" style={{ marginBottom: 6, display: 'block' }}>Destination</label>
              <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', color: 'var(--lime)' }}>
                Arc Testnet
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="bridge-grid">
            <div>
              <label className="mono-label" style={{ marginBottom: 6, display: 'block' }}>Amount</label>
              <input
                value={amount}
                onChange={event => setAmount(event.target.value)}
                disabled={isBusy || configLoading}
                inputMode="decimal"
                placeholder="0.00"
                style={fieldStyle}
              />
            </div>
            <div>
              <label className="mono-label" style={{ marginBottom: 6, display: 'block' }}>Estimated completion</label>
              <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                {estimatedCompletion}
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1,
            background: 'var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden',
          }}>
            {[
              { k: 'From', v: selectedChain.label },
              { k: 'To', v: 'Arc Testnet' },
              { k: 'Status', v: stateLabel[state] },
            ].map(item => (
              <div key={item.k} style={{ background: 'rgba(5,5,7,0.65)', padding: '12px 12px' }}>
                <div className="mono-label" style={{ marginBottom: 4 }}>{item.k}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: item.k === 'Status' ? statusColor : 'var(--text-primary)', lineHeight: 1.4 }}>
                  {item.v}
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '14px 14px', background: 'rgba(5,5,7,0.65)' }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>Transfer state</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {BRIDGE_TIMELINE.map(item => {
                const active = timelineRank(item.state) <= timelineRank(currentTimelineState(state, activeEntry))
                return (
                  <div key={item.state} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: active ? (item.state === 'completed' ? 'var(--lime)' : 'var(--violet)') : 'var(--border-hover)',
                      boxShadow: active ? '0 0 8px rgba(179,136,255,0.45)' : 'none',
                    }} />
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      letterSpacing: '0.04em',
                    }}>{item.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
          }}>
            {mode === 'simulation'
              ? 'Simulation Mode is explicit and local-only. It does not claim an onchain bridge transfer.'
              : 'Live mode submits through the configured CCTP bridge API.'}
          </div>

          {error && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
              background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.22)',
              borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
            }}>{error}</div>
          )}

          <div>
            <div className="mono-label" style={{ marginBottom: 10 }}>Recent bridge activity</div>
            {history.length === 0 ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
                No bridge activity yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.slice(0, 3).map(item => (
                  <div key={item.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
                    padding: '9px 10px', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', background: 'rgba(255,255,255,0.02)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {item.amount} USDC / {cctpChainLabel(item.sourceChainId)} to {cctpChainLabel(item.destinationChainId)}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                        {item.mode === 'simulation' ? 'Simulation Mode' : 'Live CCTP'} / {item.transferId ?? item.status}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: item.status === 'completed' ? 'var(--lime)' : 'var(--violet)', textTransform: 'uppercase' }}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'rgba(5,5,7,0.78)',
        }}>
          <button onClick={onClose} className="btn-ghost">Close</button>
          <button
            onClick={startBridge}
            disabled={!canSubmit}
            className="btn-primary"
            style={{ justifyContent: 'center', opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
          >
            {configLoading ? 'Checking config...' : isBusy ? stateLabel[state] : mode === 'simulation' ? 'Simulate bridge' : 'Initiate bridge'}
          </button>
        </div>

        <style>{`
          @media(max-width:640px){.bridge-grid{grid-template-columns:1fr!important}}
        `}</style>
      </div>
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 39,
  background: 'rgba(5,5,7,0.8)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '10px 12px',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--text-primary)',
  outline: 'none',
}

function currentTimelineState(state: BridgeState, entry: BridgeHistoryEntry | null): BridgeTimelineState {
  if (entry?.status === 'completed') return 'completed'
  if (state === 'quoting') return 'quoted'
  if (state === 'pending') return 'pending'
  if (state === 'attesting') return 'attesting'
  if (state === 'completed') return 'completed'
  return 'quoted'
}

function timelineRank(state: BridgeTimelineState): number {
  const ranks: Record<BridgeTimelineState, number> = {
    quoted: 1,
    submitted: 2,
    pending: 3,
    attesting: 4,
    completed: 5,
    failed: 0,
  }
  return ranks[state]
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}
