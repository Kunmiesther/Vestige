'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getTrace, publishTrace, ApiError } from '@/lib/api'
import { formatDate, formatRelative, confidenceLabel, sideLabel, sideColor, truncateHash } from '@/lib/trace-utils'
import { arcTxUrl } from '@/lib/arc'
import type { ReasoningTrace, ConfidenceLevel, TraceStatus, ReasoningStep } from '@/backend/shared/types/trace'

// ─── Micro-components ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className={`conviction conviction-${level}`}>{confidenceLabel(level)}</span>
}

function StatusBadge({ status }: { status: TraceStatus }) {
  const map: Record<TraceStatus, { cls: string; label: string }> = {
    draft:  { cls: 'status-watching',    label: 'Draft'     },
    stored: { cls: 'status-watching',    label: 'Stored'    },
    publishing: { cls: 'status-watching', label: 'Publishing' },
    published: { cls: 'status-in_position', label: 'Published' },
    pinned: { cls: 'status-in_position', label: 'Published' },
    failed: { cls: 'status-exited',      label: 'Failed'    },
  }
  const { cls, label } = map[status]
  return <span className={`status-badge ${cls}`}>{label}</span>
}

function ArcBadge({ status }: { status: TraceStatus }) {
  const published = status === 'published' || status === 'pinned'
  const label = published ? 'Published on Arc' : status === 'publishing' ? 'Publishing to Arc' : 'Pending publication'
  return (
    <span className={`arc-badge ${published ? 'arc-published' : 'arc-pending'}`}>
      {label}
    </span>
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
  if (step.order === 0) return 'var(--violet)'
  if (step.order === total - 1) return 'var(--lime)'
  return 'var(--ember)'
}

function StepRoleLabel(step: ReasoningStep, total: number): string {
  if (step.order === 0) return 'Researcher'
  if (step.order === total - 1) return 'Portfolio Manager'
  return 'Risk Manager'
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

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

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TraceDetailPage() {
  const params = useParams()
  const traceId = typeof params.id === 'string' ? params.id : ''

  const [trace, setTrace] = useState<ReasoningTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishStatus, setPublishStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!traceId) return
    setLoading(true); setError(null)
    getTrace(traceId)
      .then(setTrace)
      .catch(e => setError(e instanceof ApiError ? e.message : 'Trace not found.'))
      .finally(() => setLoading(false))
  }, [traceId])

  async function handlePublish() {
    if (!trace || isPublishing) return
    setIsPublishing(true)
    setActionError(null)
    setPublishStatus('Initializing wallet...')
    try {
      const updated = await publishTrace(trace.id, setPublishStatus)
      setTrace(updated)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to publish trace.')
    } finally {
      setIsPublishing(false)
      window.setTimeout(() => setPublishStatus(null), 1400)
    }
  }

  if (loading) return <Skeleton />

  if (error || !trace) return (
    <main style={{ padding: '80px 32px', maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
      <div className="mono-label" style={{ color: 'var(--ember)', marginBottom: 12 }}>Error</div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, fontWeight: 300 }}>{error ?? 'Trace not found.'}</p>
      <Link href="/traces" className="btn-ghost">← Back to traces</Link>
    </main>
  )

  const steps = [...trace.reasoningSteps].sort((a, b) => a.order - b.order)
  const total = steps.length

  return (
    <main style={{ padding: '40px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Breadcrumb */}
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

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid var(--border)' }}>

        {/* Badge row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--violet)', background: 'var(--violet-dim)',
            border: '1px solid var(--violet-border)', padding: '3px 10px', borderRadius: 3,
          }}>{trace.assetSymbol}</span>
          <ConfidenceBadge level={trace.confidence} />
          <StatusBadge status={trace.status} />
          <ArcBadge status={trace.status} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
            marginLeft: 'auto', letterSpacing: '0.04em',
          }}>{formatRelative(trace.createdAt)}</span>
        </div>

        {/* Market title */}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(22px,3.5vw,40px)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
          lineHeight: 1.1, color: 'var(--text-primary)', marginBottom: 28,
        }}>{trace.market}</h1>

        {/* Position intent bar */}
        <div style={{
          display: 'grid', gridTemplateColumns: '3px 1fr', gap: 16,
        }}>
          <div style={{ background: sideColor(trace.positionIntent.side), borderRadius: 2 }} />
          <div>
            <div className="mono-label" style={{ color: sideColor(trace.positionIntent.side), marginBottom: 10 }}>
              Position intent — {sideLabel(trace.positionIntent.side).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              {[
                trace.positionIntent.entry    && { k: 'Entry',    v: `$${trace.positionIntent.entry.toLocaleString()}`,    color: 'var(--text-primary)' },
                trace.positionIntent.target   && { k: 'Target',   v: `$${trace.positionIntent.target.toLocaleString()}`,   color: 'var(--lime)'         },
                trace.positionIntent.stopLoss && { k: 'Stop',     v: `$${trace.positionIntent.stopLoss.toLocaleString()}`, color: 'var(--ember)'        },
                                               { k: 'Horizon',   v: trace.positionIntent.timeHorizon,                     color: 'var(--text-secondary)'},
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

      {/* ── TWO COLUMN ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 300px',
        gap: 20, alignItems: 'start',
      }}>

        {/* ═══ LEFT ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Thesis */}
          <Block label="Thesis">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.9, fontWeight: 300 }}>
              {trace.thesis}
            </p>
          </Block>

          {/* Edge */}
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

          {/* Reasoning chain */}
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
                        }}>· {step.title}</span>
                      )}
                    </div>
                  </div>

                  {/* Observation */}
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: step.inference ? 10 : 0,
                  }}>{step.observation}</p>

                  {/* Inference — the key analytical leap */}
                  {step.inference && (
                    <p style={{
                      fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
                      fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 300,
                      borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4,
                    }}>{step.inference}</p>
                  )}

                  {/* Evidence points */}
                  {step.evidence && step.evidence.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {step.evidence.map((e, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--violet)', flexShrink: 0, marginTop: 3,
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
            <Block label="Catalysts">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trace.catalysts.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--lime)', flexShrink: 0, marginTop: 3 }}>↑</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, fontWeight: 300 }}>{c}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {/* Risks */}
          {trace.risks.length > 0 && (
            <Block label="Risks">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trace.risks.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ember)', flexShrink: 0, marginTop: 3 }}>⚠</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, fontWeight: 300 }}>{r}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {/* Conclusion */}
          <div className="card" style={{
            padding: '20px 22px', borderColor: 'rgba(179,136,255,0.2)',
            background: 'rgba(10,10,20,0.9)',
          }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>Conclusion</div>
            <p style={{
              fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
              fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.8, fontWeight: 300,
            }}>
              {steps[total - 1]?.inference ?? `${sideLabel(trace.positionIntent.side)} — ${trace.confidence} conviction. ${trace.positionIntent.timeHorizon} horizon.`}
            </p>
          </div>
        </div>

        {/* ═══ RIGHT ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* At a glance */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div className="mono-label" style={{ marginBottom: 14 }}>At a glance</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { k: 'Conviction', v: <ConfidenceBadge level={trace.confidence} /> },
                { k: 'Side',       v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: sideColor(trace.positionIntent.side), textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sideLabel(trace.positionIntent.side)}</span> },
                { k: 'Horizon',    v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{trace.positionIntent.timeHorizon}</span> },
                { k: 'Status',     v: <StatusBadge status={trace.status} /> },
                { k: 'Steps',      v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{steps.length} reasoning steps</span> },
              ].map(row => (
                <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="mono-label" style={{ marginBottom: 0, flexShrink: 0 }}>{row.k}</span>
                  {row.v}
                </div>
              ))}
            </div>
          </div>

          {/* Timestamps */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>Timestamps</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div className="mono-label" style={{ marginBottom: 3 }}>Created</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  {formatDate(trace.createdAt)}
                </div>
              </div>
              {trace.publishedAt && (
                <div>
                  <div className="mono-label" style={{ marginBottom: 3 }}>Published</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--lime)' }}>
                    {formatDate(trace.publishedAt)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Arc verification */}
          <div className="card" style={{ padding: '18px 20px', background: 'rgba(5,5,7,0.9)' }}>
            <div className="mono-label" style={{ marginBottom: 14 }}>Arc verification</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ArcBadge status={trace.status} />

              <div>
                <div className="mono-label" style={{ marginBottom: 4 }}>Trace ID</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                  {truncateHash(trace.id, 18)}
                </div>
              </div>

              {trace.ipfsCid && (
                <div>
                  <div className="mono-label" style={{ marginBottom: 4 }}>IPFS CID</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--lime)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                    {trace.ipfsCid}
                  </div>
                </div>
              )}

              {trace.txHash && (
                <div>
                  <div className="mono-label" style={{ marginBottom: 4 }}>Tx hash</div>
                  <a
                    href={arcTxUrl(trace.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--lime)', wordBreak: 'break-all', lineHeight: 1.6 }}
                  >
                    {truncateHash(trace.txHash)} open
                  </a>
                </div>
              )}

              {trace.irysId && (
                <div>
                  <div className="mono-label" style={{ marginBottom: 4 }}>Irys ID</div>
                  <a
                    href={`https://gateway.irys.xyz/${trace.irysId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--lime)', lineHeight: 1.6 }}
                  >
                    {truncateHash(trace.irysId)} open
                  </a>
                </div>
              )}

              {actionError && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
                  background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.22)',
                  borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
                }}>{actionError}</div>
              )}

              {publishStatus && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)',
                  background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
                  borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
                }}>{publishStatus}</div>
              )}

              {(trace.status === 'stored' || trace.status === 'draft') && (
                <button
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="btn-primary"
                  style={{
                    justifyContent: 'center',
                    opacity: isPublishing ? 0.7 : 1,
                    cursor: isPublishing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isPublishing ? (publishStatus ?? 'Publishing...') : 'Publish to Arc'}
                </button>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                {[
                  ['Network', 'Arc Testnet'],
                  ['Chain ID', '5042002'],
                  ['Gas', 'USDC'],
                  ['Finality', 'Sub-second'],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.04em', marginBottom: 5,
                  }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>{k}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {trace.verdict && (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="mono-label" style={{ marginBottom: 14 }}>Verdict</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span className="mono-label">Action</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {trace.verdict.action}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span className="mono-label">Score</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--lime)' }}>
                    {trace.verdict.score}/100
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

          <Link href="/traces" className="btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
            ← All traces
          </Link>
          <Link href="/markets" className="btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
            ↗ View in markets
          </Link>
        </div>
      </div>

      {/* Mobile styles */}
      <style>{`
        @media(max-width:768px){
          main > div:last-of-type { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}
