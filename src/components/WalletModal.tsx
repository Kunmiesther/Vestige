'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useWallet } from '@/contexts/WalletContext'
import { ARC_TESTNET } from '@/lib/arc'

interface WalletModalProps {
  onClose: () => void
}

export function WalletModal({ onClose }: WalletModalProps) {
  const { connectCircle, connectInjected, isConnecting, error } = useWallet()
  const [connecting, setConnecting] = useState<'circle' | 'injected' | null>(null)

  async function handleCircle() {
    setConnecting('circle')
    const connected = await connectCircle()
    setConnecting(null)
    if (connected) onClose()
  }

  async function handleInjected() {
    setConnecting('injected')
    const connected = await connectInjected()
    setConnecting(null)
    if (connected) onClose()
  }

  return createPortal(
    <div style={{
        position: 'fixed', inset: 0, zIndex: 90,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '80px',
        padding: '80px 16px 24px',
        background: 'rgba(5,5,7,0.9)',
        backdropFilter: 'blur(12px)',
        overflowY: 'auto',
      }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-hover)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px 28px',
          width: '100%',
          maxWidth: 400,
          overflow: 'visible',
          maxHeight: '90vh',
          overflowY: 'auto' as const,
        }}>
        <div style={{ marginBottom: 28 }}>
          <div className="mono-label" style={{ marginBottom: 8 }}>Connect wallet</div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)',
          }}>Arc Testnet</h2>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)',
            marginTop: 6, letterSpacing: '0.04em',
          }}>Chain ID {ARC_TESTNET.chainId} · USDC gas</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Circle wallet — primary */}
          <button onClick={handleCircle} disabled={isConnecting}
            style={{
                width: '100%',
                padding: '16px 18px',
                background: connecting === 'circle' ? 'rgba(179,136,255,0.12)' : 'var(--violet-dim)',
                border: '1px solid var(--violet-border)',
                borderRadius: 'var(--radius)',
                cursor: isConnecting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'background .15s',
                opacity: isConnecting && connecting !== 'circle' ? 0.5 : 1,
                minHeight: 72,
                boxSizing: 'border-box' as const,
              }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--violet)',
                marginBottom: 3,
              }}>
                {connecting === 'circle' ? '◌ Provisioning…' : 'Circle Wallet'}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
                letterSpacing: '0.04em',
              }}>Developer-controlled · Agent-linked</div>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--violet)',
              letterSpacing: '0.06em',
            }}>Recommended →</div>
          </button>

          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0',
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Injected wallet */}
          <button onClick={handleInjected} disabled={isConnecting}
            style={{
              width: '100%', padding: '14px 18px',
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', cursor: isConnecting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'border-color .15s',
              opacity: isConnecting && connecting !== 'injected' ? 0.5 : 1,
            }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                marginBottom: 3,
              }}>
                {connecting === 'injected' ? '◌ Connecting…' : 'Browser Wallet'}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
                letterSpacing: '0.04em',
              }}>MetaMask · Rabby · Coinbase</div>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
              letterSpacing: '0.06em',
            }}>Self-custody →</div>
          </button>
        </div>

        {error && (
          <div style={{
            marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--ember)', background: 'var(--ember-dim)',
            border: '1px solid rgba(255,107,53,0.2)', borderRadius: 'var(--radius)',
            padding: '10px 12px', lineHeight: 1.6,
          }}>{error}</div>
        )}

        <button onClick={onClose} style={{
          width: '100%', marginTop: 14, padding: '10px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>Cancel</button>
      </div>
    </div>
    ,
    document.body
  )
}
