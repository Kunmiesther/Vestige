'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getTrace, ApiError } from '@/lib/api'
import {
  formatDate, formatRelative, confidenceLabel,
  statusLabel, sideLabel, sideColor, truncateHash,
} from '@/lib/trace-utils'
import type { ReasoningTrace, ConfidenceLevel, TraceStatus } from '@/backend/shared/types/trace'

// ─── Badges ──────────────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className={`conviction conviction-${level}`}>{confidenceLabel(level)}</span>
}

function StatusBadge({ status }: { status: TraceStatus }) {
  const map: Record<TraceStatus, string> = {
    draft: 'status-watching', stored: 'status-watching',
    pinned: 'status-in_position', failed: 'status-exited',
  }
  return <span className={`status-badge ${map[status]}`}>{statusLabel(status)}</span>
}

function ArcBadge({ status }: { status: TraceStatus }) {
  const published = status === 'pinned'
  return (
    <span className={`arc-badge ${published ? 'arc-published' : 'arc-pending'}`}>
      {published ? '✓ Published on Arc' : '◌ Stored'}
    </span>
  )
}

// ─── Sub-blocks ───────────────────────────────────────────────────────────────

function Block({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="card" style={{ padding: '20px 22px', ...style }}>{children}</div>
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mono-label" style={{ marginBottom: 12 }}>{children}</div>
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <main style={{ padding: '40px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[100, 60, 80, 40, 90, 70].map((w, i) => (
          <div key={i} style={{
            height: i === 0 ? 36 : i === 1 ? 20 : 14,
            width: `${w}%`, background: 'var(--border)', borderRadius: 6,
            animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>
      <style>{`@keyframes shimmer { 0%,100%{opacity:.3} 50%{opacity:.7} }`}</style>
    </main>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TraceDetailPage() {
  const params = useParams()
  const traceId = typeof params.id === 'string' ? params.id : ''

  const [trace, setTrace]   = useState<ReasoningTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!traceId) return
    setLoading(true); setError(null)
    getTrace(traceId)
      .then(setTrace)
      .catch(e => setError(e instanceof ApiError ? e.message : 'Failed to load trace.'))
      .finally(() => setLoading(false))
  }, [traceId])

  if (loading) return <DetailSkeleton />

  if (error || !trace) return (
    <main style={{ padding: '80px 32px', maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
      <div className="mono-label" style={{ color: 'var(--ember)', marginBottom: 12 }}>Error</div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, fontWeight: 300 }}>
        {error ?? 'Trace not found.'}
      </p>
      <Link href="/dashboard" className="btn-ghost">← Back to dashboard</Link>
    </main>
  )

  const roleLabel = (r: string) =>
    r === 'researcher' ? 'Researcher'
    : r === 'risk_manager' ? 'Risk Manager'
    : r === 'portfolio_manager' ? 'Portfolio Manager'
    : r

  const roleColor = (r: string) =>
    r === 'researcher' ? 'var(--violet)'
    : r === 'risk_manager' ? 'var(--ember)'
    : 'var(--lime)'

  return (
    <main style={{ padding: '40px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36,
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        <Link href="/dashboard" style={{ color: 'var(--text-tertiary)', transition: 'color .15s' }}>Dashboard</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{trace.assetSymbol}</span>
        <span>/</span>
        <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {trace.id}
        </span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--violet)', background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
            padding: '3px 10px', borderRadius: 3,
          }}>{trace.assetSymbol}</span>
          <ConfidenceBadge level={trace.confidence} />
          <StatusBadge status={trace.status} />
          <ArcBadge status={trace.status} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
            letterSpacing: '0.06em', marginLeft: 'auto',
          }}>{formatRelative(trace.createdAt)}</span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(22px,3.5vw,40px)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
          lineHeight: 1.1, color: 'var(--text-primary)', marginBottom: 24,
        }}>{trace.market}</h1>

        {/* Position intent callout */}
        <div style={{ display: 'grid', gridTemplateColumns: '3px 1fr', gap: 16 }}>
          <div style={{ background: sideColor(trace.positionIntent.side), borderRadius: 2 }} />
          <div>
            <div className="mono-label" style={{
              color: sideColor(trace.positionIntent.side), marginBottom: 6,
            }}>Position intent — {sideLabel(trace.positionIntent.side)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {trace.positionIntent.entry && (
                <div>
                  <span className="mono-label">Entry </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>
                    ${trace.positionIntent.entry.toLocaleString()}
                  </span>
                </div>
              )}
              {trace.positionIntent.target && (
                <div>
                  <span className="mono-label">Target </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--lime)' }}>
                    ${trace.positionIntent.target.toLocaleString()}
                  </span>
                </div>
              )}
              {trace.positionIntent.stopLoss && (
                <div>
                  <span className="mono-label">Stop </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ember)' }}>
                    ${trace.positionIntent.stopLoss.toLocaleString()}
                  </span>
                </div>
              )}
              <div>
                <span className="mono-label">Horizon </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {trace.positionIntent.timeHorizon}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two column */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Thesis */}
          <Block>
            <Label>Thesis</Label>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.85, fontWeight: 300 }}>
              {trace.thesis}
            </p>
          </Block>

          {/* Reasoning chain */}
          <div>
            <Label>Reasoning chain</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...trace.reasoningSteps]
                .sort((a, b) => a.order - b.order)
                .map(step => (
                  <div key={step.order} className="card" style={{
                    padding: '16px 18px',
                    borderLeft: `2px solid ${roleColor(
                      step.order === 0 ? 'researcher'
                      : step.order === trace.reasoningSteps.length - 1 ? 'portfolio_manager'
                      : 'risk_manager'
                    )}`,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 10, flexWrap: 'wrap', gap: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 9,
                          letterSpacing: '0.12em', color: 'var(--text-tertiary)', textTransform: 'uppercase',
                        }}>Step {step.order + 1}</span>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: step.title ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                        }}>{step.title}</span>
                      </div>
                    </div>

                    <p style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      color: 'var(--text-secondary)', lineHeight: 1.8, fontWeight: 400,
                      marginBottom: step.inference ? 10 : 0,
                    }}>{step.observation}</p>

                    {step.inference && (
                      <p style={{
                        fontSize: 13, color: 'var(--text-primary)',
                        lineHeight: 1.7, fontStyle: 'italic',
                        fontFamily: 'var(--font-editorial)', fontWeight: 300,
                      }}>{step.inference}</p>
                    )}

                    {step.evidence && step.evidence.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {step.evidence.map((e, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: 9,
                              color: 'var(--violet)', flexShrink: 0, marginTop: 3,
                            }}>◆</span>
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

          {/* Catalysts */}
          {trace.catalysts.length > 0 && (
            <Block>
              <Label>Catalysts</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trace.catalysts.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--lime)', flexShrink: 0, marginTop: 3,
                    }}>↑</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, fontWeight: 300 }}>{c}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {/* Risks */}
          {trace.risks.length > 0 && (
            <Block>
              <Label>Risks</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trace.risks.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--ember)', flexShrink: 0, marginTop: 3,
                    }}>⚠</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, fontWeight: 300 }}>{r}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Quick stats */}
          <Block>
            <Label>At a glance</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { k: 'Confidence', v: <ConfidenceBadge level={trace.confidence} /> },
                { k: 'Side',       v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: sideColor(trace.positionIntent.side) }}>{sideLabel(trace.positionIntent.side)}</span> },
                { k: 'Horizon',    v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{trace.positionIntent.timeHorizon}</span> },
                { k: 'Status',     v: <StatusBadge status={trace.status} /> },
              ].map(row => (
                <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mono-label" style={{ marginBottom: 0 }}>{row.k}</span>
                  {row.v}
                </div>
              ))}
            </div>
          </Block>

          {/* Arc verification */}
          <Block style={{ background: 'rgba(5,5,7,0.9)' }}>
            <Label>Arc verification</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ArcBadge status={trace.status} />

              <div>
                <div className="mono-label" style={{ marginBottom: 5 }}>Trace ID</div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.6,
                }}>{truncateHash(trace.id, 16)}</div>
              </div>

              {trace.ipfsCid && (
                <div>
                  <div className="mono-label" style={{ marginBottom: 5 }}>IPFS CID</div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: 'var(--lime)', wordBreak: 'break-all', lineHeight: 1.6,
                  }}>{trace.ipfsCid}</div>
                </div>
              )}

              {trace.irysId && (
                <div>
                  <div className="mono-label" style={{ marginBottom: 5 }}>Irys ID</div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: 'var(--lime)', wordBreak: 'break-all', lineHeight: 1.6,
                  }}>{trace.irysId}</div>
                </div>
              )}

              {trace.publishedAt && (
                <div>
                  <div className="mono-label" style={{ marginBottom: 5 }}>Published</div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: 'var(--text-secondary)',
                  }}>{formatDate(trace.publishedAt)}</div>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {[
                  ['Created',  formatRelative(trace.createdAt)],
                  ['Network',  'Arc Testnet'],
                  ['Chain ID', '5042002'],
                  ['Gas',      'USDC'],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    letterSpacing: '0.04em', marginBottom: 6,
                  }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>{k}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </Block>

          <Link href="/dashboard" className="btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
