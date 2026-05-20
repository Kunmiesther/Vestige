'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useWallet } from '@/contexts/WalletContext'
import { ARC_TESTNET } from '@/lib/arc'
import { listSelfCustodyConnectors, type SelfCustodyConnectorId } from '@/lib/wallet'

interface WalletModalProps {
  onClose: () => void
}

export function WalletModal({ onClose }: WalletModalProps) {
  const {
    connectCircle,
    requestCircleEmailOtp,
    verifyCircleEmailOtp,
    connectInjected,
    isConnecting,
    error,
  } = useWallet()
  const [view, setView] = useState<'main' | 'self-custody'>('main')
  const [emailStep, setEmailStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [connecting, setConnecting] = useState<'email' | 'otp' | 'google' | SelfCustodyConnectorId | null>(null)
  const [connectors, setConnectors] = useState(() => listSelfCustodyConnectors())

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setConnecting('email')
    const sent = await requestCircleEmailOtp(email)
    setConnecting(null)
    if (sent) setEmailStep('otp')
  }

  async function handleOtpVerify() {
    setConnecting('otp')
    const connected = await verifyCircleEmailOtp()
    setConnecting(null)
    if (connected) onClose()
  }

  async function handleGoogle() {
    setConnecting('google')
    const connected = await connectCircle()
    setConnecting(null)
    if (connected) onClose()
  }

  function showSelfCustody() {
    setConnectors(listSelfCustodyConnectors())
    setView('self-custody')
  }

  async function handleInjected(connectorId: SelfCustodyConnectorId) {
    setConnecting(connectorId)
    const connected = await connectInjected(connectorId)
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
          <div className="mono-label" style={{ marginBottom: 8 }}>
            {view === 'self-custody' ? 'Choose wallet' : 'Connect wallet'}
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)',
          }}>Arc Testnet</h2>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)',
            marginTop: 6, letterSpacing: '0.04em',
          }}>Chain ID {ARC_TESTNET.chainId} - USDC gas</p>
        </div>

        {view === 'main' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <form onSubmit={handleEmailSubmit} style={{
              width: '100%',
              padding: '16px 18px',
              background: connecting === 'email' || connecting === 'otp' ? 'rgba(179,136,255,0.12)' : 'var(--violet-dim)',
              border: '1px solid var(--violet-border)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minHeight: 72,
              boxSizing: 'border-box' as const,
            }}>
              <div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--violet)',
                  marginBottom: 3,
                }}>
                  {emailStep === 'otp' ? 'Verify email' : 'Circle Wallet'}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
                  letterSpacing: '0.04em',
                }}>
                  {emailStep === 'otp' ? 'Enter the code in Circle verification' : 'User-controlled - Email OTP'}
                </div>
              </div>

              {emailStep === 'email' ? (
                <>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={isConnecting}
                    placeholder="you@example.com"
                    style={{
                      width: '100%',
                      background: 'rgba(5,5,7,0.8)',
                      border: '1px solid var(--violet-border)',
                      borderRadius: 'var(--radius)',
                      padding: '10px 12px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      outline: 'none',
                      boxSizing: 'border-box' as const,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isConnecting}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(179,136,255,0.18)',
                      border: '1px solid var(--violet-border)',
                      borderRadius: 'var(--radius)',
                      cursor: isConnecting ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--violet)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {connecting === 'email' ? 'Sending code...' : 'Continue with email'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                    wordBreak: 'break-word',
                  }}>
                    {email}
                  </div>
                  <button
                    type="button"
                    onClick={handleOtpVerify}
                    disabled={isConnecting}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(179,136,255,0.18)',
                      border: '1px solid var(--violet-border)',
                      borderRadius: 'var(--radius)',
                      cursor: isConnecting ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--violet)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {connecting === 'otp' ? 'Verifying...' : 'Verify OTP'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailStep('email')}
                    disabled={isConnecting}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: isConnecting ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Change email
                  </button>
                </>
              )}
            </form>

            <button onClick={handleGoogle} disabled={isConnecting}
              style={{
                  width: '100%',
                  padding: '14px 18px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  cursor: isConnecting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background .15s',
                  opacity: isConnecting && connecting !== 'google' ? 0.5 : 1,
                  boxSizing: 'border-box' as const,
                }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                  marginBottom: 3,
                }}>
                  {connecting === 'google' ? 'Redirecting...' : 'Continue with Google'}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
                  letterSpacing: '0.04em',
                }}>Optional social login</div>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
                letterSpacing: '0.06em',
              }}>OAuth -&gt;</div>
            </button>

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

            <button onClick={showSelfCustody} disabled={isConnecting}
              style={{
                width: '100%', padding: '14px 18px',
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', cursor: isConnecting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'border-color .15s',
                opacity: isConnecting ? 0.5 : 1,
              }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                  marginBottom: 3,
                }}>
                  Self-Custody Wallet
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
                  letterSpacing: '0.04em',
                }}>MetaMask - Rabby - Coinbase</div>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
                letterSpacing: '0.06em',
              }}>Choose -&gt;</div>
            </button>
          </div>
        )}

        {view === 'self-custody' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {connectors.map(connector => (
              <button
                key={connector.id}
                onClick={() => handleInjected(connector.id)}
                disabled={isConnecting}
                style={{
                  width: '100%', padding: '14px 18px',
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', cursor: isConnecting ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'border-color .15s',
                  opacity: isConnecting && connecting !== connector.id ? 0.5 : 1,
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                    marginBottom: 3,
                  }}>
                    {connecting === connector.id ? 'Connecting...' : connector.name}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
                    letterSpacing: '0.04em',
                  }}>{connector.description}</div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: connector.available ? 'var(--text-tertiary)' : 'var(--ember)',
                  letterSpacing: '0.06em',
                }}>{connector.available ? 'Connect ->' : 'Not detected'}</div>
              </button>
            ))}

            <button onClick={() => setView('main')} disabled={isConnecting} style={{
              width: '100%', padding: '10px',
              background: 'transparent', border: 'none', cursor: isConnecting ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>Back</button>
          </div>
        )}

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
    </div>,
    document.body
  )
}
