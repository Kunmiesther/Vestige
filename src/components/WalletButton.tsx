'use client'

import { useState } from 'react'
import { useWallet } from '@/contexts/WalletContext'
import { WalletModal } from './WalletModal'
import { getCctpQuote, submitCctpTransfer, ApiError } from '@/lib/api'
import { loadCircleSession } from '@/lib/wallet'
import { ARC_TESTNET, truncateAddress } from '@/lib/arc'

export function WalletButton() {
  const { address, isConnected, isConnecting, isOnArc, walletType, balance, switchToArc, disconnect, refreshBalance } = useWallet()
  const [showModal, setShowModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showBridge, setShowBridge] = useState(false)
  const [copied, setCopied] = useState(false)
  const modal = showModal ? <WalletModal onClose={() => setShowModal(false)} /> : null
  const bridgeModal = showBridge && address ? <BridgeModal address={address} onClose={() => setShowBridge(false)} onComplete={refreshBalance} /> : null

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
  { label: 'Ethereum Sepolia', chainId: 11155111 },
  { label: 'Base Sepolia', chainId: 84532 },
  { label: 'Arbitrum Sepolia', chainId: 421614 },
]

function BridgeModal({
  address,
  onClose,
  onComplete,
}: {
  address: string
  onClose: () => void
  onComplete: () => Promise<void>
}) {
  const [sourceChain, setSourceChain] = useState(SOURCE_CHAINS[0].chainId)
  const [amount, setAmount] = useState('')
  const [state, setState] = useState<BridgeState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function startBridge() {
    if (!amount || Number.parseFloat(amount) <= 0) {
      setError('Enter a USDC amount.')
      return
    }

    const session = loadCircleSession()
    setError(null)
    setMessage(null)

    try {
      setState('quoting')
      const quote = await getCctpQuote({
        fromChainId: sourceChain,
        toChainId: ARC_TESTNET.chainId,
        amount,
        recipient: address,
        walletId: session?.wallet?.id,
      })
      setMessage(quote.message)

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
      setState(transfer.status === 'pending' ? 'attesting' : 'completed')
      await onComplete().catch(() => undefined)
    } catch (err) {
      setState('idle')
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Bridge transfer failed.')
    }
  }

  const stateLabel: Record<BridgeState, string> = {
    idle: 'Ready',
    quoting: 'Requesting quote...',
    pending: 'Pending...',
    attesting: 'Attesting...',
    completed: 'Completed',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(5,5,7,0.9)', backdropFilter: 'blur(10px)',
      }}
      onClick={event => event.target === event.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'var(--bg-card)', border: '1px solid var(--border-hover)',
        borderRadius: 'var(--radius-lg)', padding: '24px 22px',
      }}>
        <div className="mono-label" style={{ marginBottom: 8 }}>CCTP bridge</div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.04em',
          color: 'var(--text-primary)', marginBottom: 18,
        }}>Bridge USDC to Arc</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="mono-label" style={{ marginBottom: 6, display: 'block' }}>Source chain</label>
            <select
              value={sourceChain}
              onChange={event => setSourceChain(Number(event.target.value))}
              disabled={state !== 'idle'}
              style={{
                width: '100%', background: 'rgba(5,5,7,0.8)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--text-primary)', outline: 'none',
              }}
            >
              {SOURCE_CHAINS.map(chain => (
                <option key={chain.chainId} value={chain.chainId}>{chain.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mono-label" style={{ marginBottom: 6, display: 'block' }}>Amount</label>
            <input
              value={amount}
              onChange={event => setAmount(event.target.value)}
              disabled={state !== 'idle'}
              inputMode="decimal"
              placeholder="0.00"
              style={{
                width: '100%', background: 'rgba(5,5,7,0.8)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
          }}>
            {stateLabel[state]}
            {message ? ` / ${message}` : ''}
          </div>

          {error && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
              background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.22)',
              borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              onClick={startBridge}
              disabled={state !== 'idle'}
              className="btn-primary"
              style={{ flex: 1, justifyContent: 'center', opacity: state !== 'idle' ? 0.7 : 1 }}
            >
              {state === 'idle' ? 'Initiate bridge' : stateLabel[state]}
            </button>
            <button onClick={onClose} className="btn-ghost">Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
