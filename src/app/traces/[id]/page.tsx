'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getPremiumTrace, ApiError } from '@/lib/api'
import {
  formatDate,
  formatRelative,
  sideLabel,
  sideColor,
  truncateHash,
  traceAccessLabel,
  traceUnlockPrice,
  traceUnlockCount,
  deriveAuditMetrics,
  metricLabel,
  convictionState,
} from '@/lib/trace-utils'
import type { ReasoningTrace, TraceStatus, ReasoningStep, TracePaymentReceipt } from '@/backend/shared/types/trace'
import type { PaymentChallenge, PremiumTracePreview } from '@/backend/shared/types/api'

function StatusBadge({ status }: { status: TraceStatus }) {
  const map: Record<TraceStatus, { cls: string; label: string }> = {
    draft: { cls: 'status-watching', label: 'Draft' },
    stored: { cls: 'status-watching', label: 'Stored' },
    failed: { cls: 'status-exited', label: 'Failed' },
  }
  const { cls, label } = map[status]
  return <span className={`status-badge ${cls}`}>{label}</span>
}

function LocalAuditBadge() {
  return (
    <span className="audit-badge">
      Local audit trail
    </span>
  )
}

function AccessBadge({ label }: { label: string }) {
  const premium = label !== 'PUBLIC'
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: premium ? 'var(--lime)' : 'var(--text-secondary)',
      background: premium ? 'var(--lime-dim)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${premium ? 'var(--lime-border)' : 'var(--border)'}`,
      padding: '3px 10px', borderRadius: 3,
    }}>{label}</span>
  )
}

function Block({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="card" style={{
      padding: '20px 22px',
      ...(accent ? { borderColor: accent, borderLeftWidth: 2 } : {}),
    }}>
      <div className="mono-label" style={{ marginBottom: 12 }}>{label}</div>
      {children}
    </div>
  )
}

function StepRoleColor(step: ReasoningStep, total: number): string {
  const title = step.title.toLowerCase()
  if (title.includes('macro')) return 'var(--ice)'
  if (title.includes('sentiment')) return 'var(--violet)'
  if (title.includes('technical')) return 'var(--lime)'
  if (title.includes('risk')) return 'var(--ember)'
  if (title.includes('catalyst')) return 'var(--violet)'
  if (title.includes('committee') || title.includes('synthesis')) return 'var(--lime)'
  if (step.order === 0) return 'var(--violet)'
  if (step.order === total - 1) return 'var(--lime)'
  return 'var(--ember)'
}

function StepRoleLabel(step: ReasoningStep, total: number): string {
  const title = step.title.toLowerCase()
  if (title.includes('macro')) return 'Macro'
  if (title.includes('sentiment')) return 'Sentiment'
  if (title.includes('technical')) return 'Technical'
  if (title.includes('risk')) return 'Risk'
  if (title.includes('catalyst')) return 'Catalyst'
  if (title.includes('committee') || title.includes('synthesis')) return 'Committee'
  if (step.order === 0) return 'Researcher'
  if (step.order === total - 1) return 'Portfolio Manager'
  return 'Risk Manager'
}

function Skeleton() {
  return (
    <main style={{ padding: '40px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[{ w: '100%', h: 14 }, { w: '60%', h: 40 }, { w: '80%', h: 14 }, { w: '40%', h: 14 }].map((d, i) => (
          <div key={i} style={{ height: d.h, width: d.w, background: 'var(--border)', borderRadius: 6, animation: 'shimmer 1.5s ease-in-out infinite' }} />
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, marginTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[120, 200, 280, 200].map((h, i) => (
              <div key={i} style={{ height: h, background: 'var(--border)', borderRadius: 10, animation: 'shimmer 1.5s ease-in-out infinite' }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[120, 180, 160].map((h, i) => (
              <div key={i} style={{ height: h, background: 'var(--border)', borderRadius: 10, animation: 'shimmer 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes shimmer{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>
    </main>
  )
}

export default function TraceDetailPage() {
  const params = useParams()
  const traceId = typeof params.id === 'string' ? params.id : ''

  const [trace, setTrace] = useState<ReasoningTrace | null>(null)
  const [paymentRequired, setPaymentRequired] = useState<PaymentChallenge | null>(null)
  const [tracePreview, setTracePreview] = useState<PremiumTracePreview | null>(null)
  const [paymentHeader, setPaymentHeader] = useState('')
  const [paymentReceipt, setPaymentReceipt] = useState<TracePaymentReceipt | undefined>(undefined)
  const [unlocking, setUnlocking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!traceId) return
    setLoading(true); setError(null)
    getPremiumTrace(traceId)
      .then(result => {
        if (result.status === 'payment_required') {
          setPaymentRequired(result.paymentRequired)
          setTracePreview(result.tracePreview ?? null)
          setTrace(null)
          return
        }
        setTrace(result.trace)
        setPaymentReceipt(result.receipt)
        setPaymentRequired(null)
        setTracePreview(null)
      })
      .catch(e => setError(e instanceof ApiError ? e.message : 'Trace not found.'))
      .finally(() => setLoading(false))
  }, [traceId])

  async function unlockTrace() {
    if (!traceId || !paymentHeader.trim()) {
      setActionError('x402 payment authorization is required.')
      return
    }

    setUnlocking(true)
    setActionError(null)
    setActionStatus('Verifying USDC payment...')
    try {
      const result = await getPremiumTrace(traceId, paymentHeader.trim())
      if (result.status === 'payment_required') {
        setPaymentRequired(result.paymentRequired)
        setTracePreview(result.tracePreview ?? tracePreview)
        setActionError('Payment was not accepted by the x402 facilitator.')
        return
      }
      setTrace(result.trace)
      setPaymentReceipt(result.receipt)
      setPaymentRequired(null)
      setTracePreview(null)
      setActionStatus('Trace unlocked')
      window.setTimeout(() => setActionStatus(null), 1800)
    } catch (e) {
      setActionError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Payment verification failed.')
    } finally {
      setUnlocking(false)
    }
  }

  async function copyText(text: string, label: string) {
    setActionError(null)
    try {
      await navigator.clipboard.writeText(text)
      setActionStatus(`${label} copied`)
      window.setTimeout(() => setActionStatus(null), 1600)
    } catch {
      setActionError('Clipboard copy failed.')
    }
  }

  function download(filename: string, body: string, type: string) {
    const blob = new Blob([body], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setActionStatus('Report downloaded')
    window.setTimeout(() => setActionStatus(null), 1600)
  }

  if (loading) return <Skeleton />

  if (paymentRequired && !trace) return (
    <main style={{ padding: '48px 32px 100px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36,
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        <Link href="/traces" style={{ color: 'var(--text-tertiary)', transition: 'color .15s' }}>Traces</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{tracePreview?.assetSymbol ?? 'Premium'}</span>
        <span>/</span>
        <span>{truncateHash(traceId, 18)}</span>
      </div>

      <div className="card" style={{ padding: '28px 30px', borderColor: 'var(--lime-border)', background: 'rgba(10,10,20,0.92)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <AccessBadge label={(tracePreview?.accessTier ?? 'premium').toUpperCase()} />
          <span className="audit-badge">x402 gated trace</span>
          {tracePreview?.unlockCount !== undefined && (
            <span className="mono-label" style={{ marginBottom: 0, color: 'var(--text-tertiary)' }}>
              {tracePreview.unlockCount} paid unlock{tracePreview.unlockCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(24px,4vw,42px)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
          lineHeight: 1.05, color: 'var(--text-primary)', marginBottom: 14,
        }}>{tracePreview?.market ?? 'Premium reasoning trace'}</h1>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, fontWeight: 300, marginBottom: 24 }}>
          Access requires a settled USDC payment. Vestige unlocks the full audit trail only after the x402 facilitator verifies and settles the payment authorization.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 22 }}>
          {[
            { k: 'Price', v: `${paymentRequired.amount} ${paymentRequired.asset}` },
            { k: 'Network', v: paymentRequired.network },
            { k: 'Status', v: unlocking ? 'verifying' : 'payment required' },
            { k: 'Demand', v: String(tracePreview?.demandScore ?? tracePreview?.unlockCount ?? 0) },
          ].map(item => (
            <div key={item.k} style={{ background: 'var(--bg-card)', padding: '14px 16px' }}>
              <div className="mono-label" style={{ marginBottom: 5 }}>{item.k}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: item.k === 'Price' ? 'var(--lime)' : 'var(--text-primary)' }}>{item.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="mono-label" style={{ marginBottom: 6, display: 'block' }}>x402 payment authorization</label>
            <textarea
              value={paymentHeader}
              onChange={event => setPaymentHeader(event.target.value)}
              disabled={unlocking}
              rows={4}
              placeholder="Paste signed x-payment header"
              style={{
                width: '100%', background: 'rgba(5,5,7,0.8)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--text-primary)', outline: 'none', resize: 'vertical', lineHeight: 1.7,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={unlockTrace}
              disabled={unlocking}
              className="btn-primary"
              style={{ opacity: unlocking ? 0.7 : 1, cursor: unlocking ? 'not-allowed' : 'pointer' }}
            >
              {unlocking ? 'Verifying payment...' : `Unlock Trace - ${paymentRequired.amount} ${paymentRequired.asset}`}
            </button>
            <button onClick={() => copyText(JSON.stringify(paymentRequired, null, 2), 'Payment challenge')} className="btn-ghost">
              Copy challenge
            </button>
          </div>

          {actionError && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
              background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.22)',
              borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
            }}>{actionError}</div>
          )}

          {actionStatus && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)',
              background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
              borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
            }}>{actionStatus}</div>
          )}

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.7, wordBreak: 'break-all' }}>
            Pay to {paymentRequired.payTo} / resource {paymentRequired.resource}
          </div>
        </div>
      </div>
    </main>
  )

  if (error || !trace) return (
    <main style={{ padding: '80px 32px', maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
      <div className="mono-label" style={{ color: 'var(--ember)', marginBottom: 12 }}>Error</div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, fontWeight: 300 }}>{error ?? 'Trace not found.'}</p>
      <Link href="/traces" className="btn-ghost">Back to traces</Link>
    </main>
  )

  const steps = [...trace.reasoningSteps].sort((a, b) => a.order - b.order)
  const total = steps.length
  const markdown = traceToMarkdown(trace, steps)
  const json = JSON.stringify(trace, null, 2)
  const summary = traceToSummary(trace)
  const auditMetrics = deriveAuditMetrics(trace)
  const receipts = uniqueReceipts([...(trace.paymentReceipts ?? []), ...(paymentReceipt ? [paymentReceipt] : [])])
  const unlockCount = Math.max(traceUnlockCount(trace), receipts.length)

  return (
    <main style={{ padding: '40px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36,
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        <Link href="/traces" style={{ color: 'var(--text-tertiary)', transition: 'color .15s' }}>Traces</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{trace.assetSymbol}</span>
        <span>/</span>
        <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trace.id}</span>
      </div>

      <div style={{ marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--violet)', background: 'var(--violet-dim)',
            border: '1px solid var(--violet-border)', padding: '3px 10px', borderRadius: 3,
          }}>{trace.assetSymbol}</span>
          <AccessBadge label={traceAccessLabel(trace)} />
          <StatusBadge status={trace.status} />
          <LocalAuditBadge />
          {receipts.length > 0 && <span className="audit-badge">Paid access</span>}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
            marginLeft: 'auto', letterSpacing: '0.04em',
          }}>{formatRelative(trace.createdAt)}</span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(22px,3.5vw,40px)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
          lineHeight: 1.1, color: 'var(--text-primary)', marginBottom: 28,
        }}>{trace.market}</h1>

        <div style={{
          display: 'grid', gridTemplateColumns: '3px 1fr', gap: 16,
        }}>
          <div style={{ background: sideColor(trace.positionIntent.side), borderRadius: 2 }} />
          <div>
            <div className="mono-label" style={{ color: sideColor(trace.positionIntent.side), marginBottom: 10 }}>
              Position intent - {sideLabel(trace.positionIntent.side).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              {[
                trace.positionIntent.entry && { k: 'Entry', v: `$${trace.positionIntent.entry.toLocaleString()}`, color: 'var(--text-primary)' },
                trace.positionIntent.target && { k: 'Target', v: `$${trace.positionIntent.target.toLocaleString()}`, color: 'var(--lime)' },
                trace.positionIntent.stopLoss && { k: 'Stop', v: `$${trace.positionIntent.stopLoss.toLocaleString()}`, color: 'var(--ember)' },
                { k: 'Horizon', v: trace.positionIntent.timeHorizon, color: 'var(--text-secondary)' },
              ].filter(Boolean).map(item => item && (
                <div key={item.k}>
                  <span className="mono-label" style={{ marginRight: 6, display: 'inline' }}>{item.k}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: item.color }}>{item.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 300px',
        gap: 20, alignItems: 'start',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Block label="Thesis">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.9, fontWeight: 300 }}>
              {trace.thesis}
            </p>
          </Block>

          <div style={{ display: 'grid', gridTemplateColumns: '3px 1fr', gap: 14 }}>
            <div style={{ background: 'var(--lime)', borderRadius: 2 }} />
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="mono-label" style={{ color: 'var(--lime)', marginBottom: 8 }}>Edge</div>
              <p style={{
                fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
                fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 300,
              }}>
                {steps[0]?.inference ?? trace.thesis}
              </p>
            </div>
          </div>

          <div>
            <div className="mono-label" style={{ marginBottom: 12 }}>Reasoning chain</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map(step => (
                <div key={step.order} className="card" style={{
                  padding: '16px 18px',
                  borderLeft: `2px solid ${StepRoleColor(step, total)}`,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 10, flexWrap: 'wrap', gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'var(--text-tertiary)',
                      }}>Step {step.order + 1}</span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
                        textTransform: 'uppercase', fontWeight: 500,
                        color: StepRoleColor(step, total),
                      }}>{StepRoleLabel(step, total)}</span>
                      {step.title && (
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: 'var(--text-tertiary)', letterSpacing: '0.04em',
                        }}>- {step.title}</span>
                      )}
                    </div>
                  </div>

                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: step.inference ? 10 : 0,
                  }}>{step.observation}</p>

                  {step.inference && (
                    <p style={{
                      fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
                      fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 300,
                      borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4,
                    }}>{step.inference}</p>
                  )}

                  {step.evidence && step.evidence.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {step.evidence.map((e, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--violet)', flexShrink: 0, marginTop: 3,
                          }}>-</span>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 11,
                            color: 'var(--text-tertiary)', lineHeight: 1.6,
                          }}>{e}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {trace.catalysts.length > 0 && (
            <Block label="Catalysts">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trace.catalysts.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--lime)', flexShrink: 0, marginTop: 3 }}>+</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, fontWeight: 300 }}>{c}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {trace.risks.length > 0 && (
            <Block label="Risks">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trace.risks.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ember)', flexShrink: 0, marginTop: 3 }}>!</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, fontWeight: 300 }}>{r}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          <div className="card" style={{
            padding: '20px 22px', borderColor: 'rgba(179,136,255,0.2)',
            background: 'rgba(10,10,20,0.9)',
          }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>Conclusion</div>
            <p style={{
              fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
              fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.8, fontWeight: 300,
            }}>
              {steps[total - 1]?.inference ?? `${sideLabel(trace.positionIntent.side)} positioning. ${convictionState(trace)}. ${trace.positionIntent.timeHorizon} horizon.`}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div className="mono-label" style={{ marginBottom: 14 }}>Audit lens</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { k: 'Positioning', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: sideColor(trace.positionIntent.side), textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sideLabel(trace.positionIntent.side)}</span> },
                { k: 'State', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{trace.verdict?.action ?? 'RANGE CONDITIONS'}</span> },
                { k: 'Regime', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{auditMetrics.marketRegime}</span> },
                { k: 'Liquidity', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{auditMetrics.liquidityState}</span> },
                { k: 'Volatility', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{auditMetrics.volatilityState}</span> },
                { k: 'Alignment', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{metricLabel(auditMetrics.alignment)}</span> },
                { k: 'Pressure', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{metricLabel(auditMetrics.pressure)}</span> },
                { k: 'Catalyst', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{metricLabel(auditMetrics.catalystStrength)}</span> },
                { k: 'Disagreement', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{metricLabel(auditMetrics.disagreement)}</span> },
                { k: 'Conviction', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{auditMetrics.convictionTemperature}</span> },
                { k: 'Demand', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{trace.demandScore ?? unlockCount}</span> },
              ].map(row => (
                <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="mono-label" style={{ marginBottom: 0, flexShrink: 0 }}>{row.k}</span>
                  {row.v}
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px' }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>Timestamps</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div className="mono-label" style={{ marginBottom: 3 }}>Created</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  {formatDate(trace.createdAt)}
                </div>
              </div>
              <div>
                <div className="mono-label" style={{ marginBottom: 3 }}>Unlocks</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  {unlockCount} paid access event{unlockCount === 1 ? '' : 's'}
                </div>
              </div>
              <div>
                <div className="mono-label" style={{ marginBottom: 3 }}>Demand</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  {trace.demandScore ?? unlockCount}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px', background: 'rgba(5,5,7,0.9)' }}>
            <div className="mono-label" style={{ marginBottom: 14 }}>Audit trail</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <LocalAuditBadge />
              <AccessBadge label={traceAccessLabel(trace)} />

              <div>
                <div className="mono-label" style={{ marginBottom: 4 }}>Trace ID</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                  {truncateHash(trace.id, 18)}
                </div>
              </div>

              {actionError && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
                  background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.22)',
                  borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
                }}>{actionError}</div>
              )}

              {actionStatus && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)',
                  background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
                  borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
                }}>{actionStatus}</div>
              )}

              <button onClick={() => copyText(summary, 'Summary')} className="btn-ghost" style={{ justifyContent: 'center' }}>
                Copy summary
              </button>
              <button onClick={() => copyText(markdown, 'Markdown')} className="btn-ghost" style={{ justifyContent: 'center' }}>
                Copy markdown
              </button>
              <button onClick={() => copyText(json, 'JSON')} className="btn-ghost" style={{ justifyContent: 'center' }}>
                Copy JSON
              </button>
              <button onClick={() => download(`${trace.assetSymbol}-${trace.id}.json`, json, 'application/json')} className="btn-ghost" style={{ justifyContent: 'center' }}>
                Export JSON
              </button>
              <button onClick={() => download(`${trace.assetSymbol}-${trace.id}.md`, markdown, 'text/markdown')} className="btn-primary" style={{ justifyContent: 'center' }}>
                Download report
              </button>
            </div>
          </div>

          {trace.verdict && (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="mono-label" style={{ marginBottom: 14 }}>Verdict</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span className="mono-label">Positioning</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>
                    {trace.verdict.action}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {trace.verdict.summary}
                </p>
                {trace.verdict.primaryDrivers.length > 0 && (
                  <div>
                    <div className="mono-label" style={{ marginBottom: 6 }}>Primary drivers</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {trace.verdict.primaryDrivers.map((driver, index) => (
                        <div key={index} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {driver}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {trace.verdict.invalidation.length > 0 && (
                  <div>
                    <div className="mono-label" style={{ marginBottom: 6 }}>Invalidation</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {trace.verdict.invalidation.map((item, index) => (
                        <div key={index} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)', lineHeight: 1.6 }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {receipts.length > 0 && (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="mono-label" style={{ marginBottom: 14 }}>Transaction receipt</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {receipts.map(receipt => (
                  <div key={receipt.receiptId} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Receipt</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, wordBreak: 'break-all' }}>
                      {receipt.receiptId}
                    </div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Amount</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--lime)' }}>{receipt.amount} {receipt.asset}</div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Network</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{receipt.network}</div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Unlocked</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{formatDate(receipt.unlockedAt)}</div>
                    {receipt.txHash && (
                      <>
                        <span className="mono-label" style={{ marginBottom: 0 }}>Tx hash</span>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{receipt.txHash}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link href="/traces" className="btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
            All traces
          </Link>
          <Link href="/markets" className="btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
            View in markets
          </Link>
        </div>
      </div>

      <style>{`
        @media(max-width:768px){
          main > div:last-of-type { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}

function traceToSummary(trace: ReasoningTrace): string {
  const verdict = trace.verdict?.action ?? convictionState(trace)
  return [
    `${trace.assetSymbol}: ${trace.market}`,
    `Verdict: ${verdict}`,
    `Access: ${traceAccessLabel(trace)}${trace.premium ? ` - ${traceUnlockPrice(trace)} USDC` : ''}`,
    `Side: ${sideLabel(trace.positionIntent.side)}; horizon: ${trace.positionIntent.timeHorizon}`,
    `Thesis: ${trace.thesis}`,
  ].join('\n')
}

function traceToMarkdown(trace: ReasoningTrace, steps: ReasoningStep[]): string {
  const lines = [
    `# Vestige Trace: ${trace.assetSymbol}`,
    '',
    `- Trace ID: ${trace.id}`,
    `- Market: ${trace.market}`,
    `- Created: ${formatDate(trace.createdAt)}`,
    `- Status: ${trace.status}`,
    `- Access tier: ${traceAccessLabel(trace)}`,
    `- Conviction state: ${convictionState(trace)}`,
    `- Positioning: ${trace.verdict?.action ?? sideLabel(trace.positionIntent.side)}`,
    `- Paid unlocks: ${traceUnlockCount(trace)}`,
    '',
    '## Thesis',
    trace.thesis,
    '',
    '## Verdict',
    trace.verdict
      ? `${trace.verdict.action}: ${trace.verdict.summary}`
      : 'No structured verdict recorded.',
    '',
    '## Reasoning Chain',
    ...steps.flatMap((step) => [
      '',
      `### ${step.order + 1}. ${step.title}`,
      step.observation,
      '',
      step.inference,
      ...(step.evidence?.length ? ['', ...step.evidence.map((item) => `- ${item}`)] : []),
    ]),
    '',
    '## Risks',
    ...(trace.risks.length ? trace.risks.map((item) => `- ${item}`) : ['- None recorded.']),
    '',
    '## Catalysts',
    ...(trace.catalysts.length ? trace.catalysts.map((item) => `- ${item}`) : ['- None recorded.']),
  ]
  return lines.join('\n')
}

function uniqueReceipts(receipts: TracePaymentReceipt[]): TracePaymentReceipt[] {
  const seen = new Set<string>()
  return receipts.filter(receipt => {
    const key = receipt.receiptId || receipt.txHash || receipt.unlockedAt
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
