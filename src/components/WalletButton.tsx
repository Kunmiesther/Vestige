'use client'

import { useState } from 'react'
import { useWallet } from '@/contexts/WalletContext'
import { WalletModal } from './WalletModal'
import { truncateAddress } from '@/lib/arc'
import { ARC_TESTNET } from '@/lib/arc'

export function WalletButton() {
  const { address, isConnected, isConnecting, isOnArc, walletType, balance, switchToArc, disconnect } = useWallet()
  const [showModal, setShowModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

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
        {showModal && <WalletModal onClose={() => setShowModal(false)} />}
      </>
    )
  }

  // Connecting
  if (isConnecting) {
    return (
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
          <span style={{ color: 'var(--text-tertiary)', borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
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
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                wordBreak: 'break-all', lineHeight: 1.5,
              }}>{address}</div>
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
    </div>
  )
}
