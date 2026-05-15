'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { listAgents, listTraces, runAgent, ApiError } from '@/lib/api'
import {
  formatRelative,
  confidenceLabel,
  deriveEdge,
  deriveBadgeStatus,
  sideLabel,
  sideColor,
} from '@/lib/trace-utils'
import type { Agent, ReasoningTrace } from '@/lib/api'
import type { ConfidenceLevel } from '@/backend/shared/types/trace'

// ─── Badges ──────────────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className={`conviction conviction-${level}`}>{confidenceLabel(level)}</span>
}

function TraceBadge({ trace }: { trace: ReasoningTrace }) {
  const badge = deriveBadgeStatus(trace)
  const map = {
    active:   { cls: 'status-in_position', label: 'In Position' },
    watching: { cls: 'status-watching',    label: 'Watching'    },
    neutral:  { cls: 'status-watching',    label: 'Neutral'     },
    exited:   { cls: 'status-exited',      label: 'Exited'      },
  }
  const { cls, label } = map[badge]
  return <span className={`status-badge ${cls}`}>{label}</span>
}

function SideBadge({ side }: { side: ReasoningTrace['positionIntent']['side'] }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: sideColor(side),
      background: side === 'long' ? 'var(--lime-dim)' : side === 'short' ? 'var(--ember-dim)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${side === 'long' ? 'var(--lime-border)' : side === 'short' ? 'rgba(255,107,53,0.2)' : 'var(--border)'}`,
      padding: '3px 9px', borderRadius: 3,
    }}>{sideLabel(side)}</span>
  )
}

// ─── Run Modal ────────────────────────────────────────────────────────────────

function RunModal({ agents, onClose, onSuccess }: {
  agents: Agent[]
  onClose: () => void
  onSuccess: (trace: ReasoningTrace) => void
}) {
  const [agentId, setAgentId]     = useState(agents[0]?.id ?? '')
  const [market, setMarket]       = useState('')
  const [asset, setAsset]         = useState('')
  const [price, setPrice]         = useState('')
  const [headlines, setHeadlines] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleSubmit() {
    if (!market.trim() || !asset.trim()) { setError('Market and asset symbol are required.'); return }
    setError(null); setLoading(true)
    try {
      const result = await runAgent(agentId, {
        market: market.trim(),
        assetSymbol: asset.trim().toUpperCase(),
        context: {
          price: price ? parseFloat(price) : undefined,
          headlines: headlines ? headlines.split('\n').map(h => h.trim()).filter(Boolean) : undefined,
        },
      })
      onSuccess(result.trace)
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Unexpected error.')
    } finally {
      setLoading(false)
    }
  }

  const iStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(5,5,7,0.8)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12,
    color: 'var(--text-primary)', outline: 'none', letterSpacing: '0.02em',
  }
  const lStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
    textTransform: 'uppercase' as const, color: 'var(--text-tertiary)',
    marginBottom: 6, display: 'block',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      background: 'rgba(5,5,7,0.88)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-hover)',
        borderRadius: 'var(--radius-lg)', padding: '32px 28px',
        width: '100%', maxWidth: 480,
      }}>
        <div style={{ marginBottom: 24 }}>
          <div className="mono-label" style={{ marginBottom: 8 }}>Run analysis</div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)',
          }}>New trace</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lStyle}>Agent</label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} disabled={loading} style={{ ...iStyle, cursor: 'pointer' }}>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} — {a.model}</option>)}
            </select>
          </div>

          <div>
            <label style={lStyle}>Market question</label>
            <input type="text" value={market} onChange={e => setMarket(e.target.value)} disabled={loading}
              placeholder="Will BTC reach $120k before June 30, 2026?" style={iStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lStyle}>Asset symbol</label>
              <input type="text" value={asset} onChange={e => setAsset(e.target.value)} disabled={loading} placeholder="BTC" style={iStyle} />
            </div>
            <div>
              <label style={lStyle}>Price (optional)</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} disabled={loading} placeholder="108400" style={iStyle} />
            </div>
          </div>

          <div>
            <label style={lStyle}>Headlines (optional, one per line)</label>
            <textarea value={headlines} onChange={e => setHeadlines(e.target.value)} disabled={loading} rows={3}
              placeholder={"ETF inflows hit $1.1B third week running\nFed holds rates"} style={{ ...iStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>

          {error && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
              background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.2)',
              borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={handleSubmit} disabled={loading} className="btn-primary"
              style={{ flex: 1, justifyContent: 'center', opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '◌ Running agent…' : 'Run analysis →'}
            </button>
            <button onClick={onClose} disabled={loading} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </div>
      <style>{`select option { background: #0a0a12; color: #f0eff8; }`}</style>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[80, 55, 90].map((w, i) => (
          <div key={i} style={{
            height: i === 0 ? 14 : 11, width: `${w}%`,
            background: 'var(--border)', borderRadius: 4,
            animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>
      <style>{`@keyframes shimmer { 0%,100%{opacity:.3} 50%{opacity:.7} }`}</style>
    </div>
  )
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ trace, onDismiss }: { trace: ReasoningTrace; onDismiss: () => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 300,
      background: 'var(--bg-card)', border: '1px solid var(--lime-border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 20px', maxWidth: 340,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--lime)', marginBottom: 6,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span className="live-dot" /> Trace generated
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.4,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {trace.market}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Link href={`/trace/${trace.id}`} className="btn-trace" style={{ flex: 1, justifyContent: 'center' }}>
          View trace →
        </Link>
        <button onClick={onDismiss} className="btn-ghost" style={{ padding: '6px 12px' }}>✕</button>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [agents, setAgents]             = useState<Agent[]>([])
  const [traces, setTraces]             = useState<ReasoningTrace[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loadingTraces, setLoadingTraces] = useState(true)
  const [agentsError, setAgentsError]   = useState<string | null>(null)
  const [tracesError, setTracesError]   = useState<string | null>(null)
  const [showModal, setShowModal]       = useState(false)
  const [newTrace, setNewTrace]         = useState<ReasoningTrace | null>(null)
  const [filter, setFilter]             = useState<'all' | 'active' | 'watching' | 'exited'>('all')

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true); setAgentsError(null)
    try { setAgents(await listAgents()) }
    catch (e) { setAgentsError(e instanceof ApiError ? e.message : 'Failed to load agents.') }
    finally { setLoadingAgents(false) }
  }, [])

  const fetchTraces = useCallback(async () => {
    setLoadingTraces(true); setTracesError(null)
    try { const { traces: d } = await listTraces({ limit: 50 }); setTraces(d) }
    catch (e) { setTracesError(e instanceof ApiError ? e.message : 'Failed to load traces.') }
    finally { setLoadingTraces(false) }
  }, [])

  useEffect(() => { fetchAgents(); fetchTraces() }, [fetchAgents, fetchTraces])

  function handleRunSuccess(trace: ReasoningTrace) {
    setShowModal(false)
    setNewTrace(trace)
    setTraces(prev => [trace, ...prev])
  }

  const filtered = traces.filter(t => {
    if (filter === 'all') return true
    const b = deriveBadgeStatus(t)
    if (filter === 'active') return b === 'active'
    if (filter === 'watching') return b === 'watching' || b === 'neutral'
    if (filter === 'exited') return b === 'exited'
    return true
  })

  const inPosition = traces.filter(t => deriveBadgeStatus(t) === 'active').length
  const watching   = traces.filter(t => ['watching','neutral'].includes(deriveBadgeStatus(t))).length

  return (
    <>
      <main style={{ padding: '48px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'flex-start',
          gap: 24, marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div className="mono-label" style={{ marginBottom: 14 }}>Market intelligence — Arc testnet</div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,52px)',
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
              lineHeight: 0.95, color: 'var(--text-primary)',
            }}>
              Active<br /><span style={{ color: 'var(--violet)' }}>Traces</span>
            </h1>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
            <button onClick={() => setShowModal(true)} disabled={loadingAgents || agents.length === 0}
              className="btn-primary"
              style={{ opacity: loadingAgents || agents.length === 0 ? 0.5 : 1,
                cursor: loadingAgents || agents.length === 0 ? 'not-allowed' : 'pointer' }}>
              {loadingAgents ? '◌ Loading…' : '+ Run analysis'}
            </button>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1,
              background: 'var(--border)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            }}>
              {[
                { label: 'Total',       val: loadingTraces ? '—' : String(traces.length),   color: 'var(--text-primary)' },
                { label: 'In position', val: loadingTraces ? '—' : String(inPosition),      color: 'var(--lime)' },
                { label: 'Watching',    val: loadingTraces ? '—' : String(watching),         color: 'var(--ice)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg-card)', padding: '12px 16px', textAlign: 'center' }}>
                  <div className="mono-label" style={{ marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Agents error */}
        {agentsError && (
          <div style={{
            border: '1px solid rgba(255,107,53,0.25)', background: 'rgba(255,107,53,0.04)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 300 }}>{agentsError}</p>
            <button onClick={fetchAgents} className="btn-ghost">Retry</button>
          </div>
        )}

        {/* Filters */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16, flexWrap: 'wrap', gap: 12,
        }}>
          <div className="mono-label">
            {loadingTraces ? 'Loading…' : `${filtered.length} trace${filtered.length !== 1 ? 's' : ''}`}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all','active','watching','exited'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '5px 12px', borderRadius: 3,
                border: '1px solid var(--border)',
                background: filter === f ? 'var(--violet-dim)' : 'transparent',
                color: filter === f ? 'var(--violet)' : 'var(--text-tertiary)',
                cursor: 'pointer',
              }}>{f}</button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr 110px 110px 110px 80px 90px',
          gap: 12, padding: '6px 20px', marginBottom: 6,
        }} className="hide-mobile">
          {['Asset','Market / Edge','Confidence','Side','Status','Age',''].map(h => (
            <div key={h} className="mono-label">{h}</div>
          ))}
        </div>

        {/* Traces error */}
        {tracesError && !loadingTraces && (
          <div style={{
            border: '1px solid rgba(255,107,53,0.25)', background: 'rgba(255,107,53,0.04)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 300 }}>{tracesError}</p>
            <button onClick={fetchTraces} className="btn-ghost">Retry</button>
          </div>
        )}

        {/* Skeletons */}
        {loadingTraces && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[1,2,3].map(i => <Skeleton key={i} />)}
          </div>
        )}

        {/* Empty */}
        {!loadingTraces && !tracesError && filtered.length === 0 && (
          <div style={{
            border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)',
            padding: '60px 32px', textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'var(--text-tertiary)', marginBottom: 8,
            }}>No traces yet</div>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24, fontWeight: 300 }}>
              Run an analysis to generate your first reasoning trace.
            </p>
            <button onClick={() => setShowModal(true)} disabled={agents.length === 0} className="btn-primary">
              + Run analysis
            </button>
          </div>
        )}

        {/* Trace list */}
        {!loadingTraces && !tracesError && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(trace => {
              const badge = deriveBadgeStatus(trace)
              const borderColor = badge === 'active' ? 'var(--lime)' : badge === 'watching' ? 'var(--ice)' : 'transparent'

              return (
                <Link key={trace.id} href={`/trace/${trace.id}`}>
                  <div className="card" style={{ padding: '18px 20px', cursor: 'pointer', borderLeft: `2px solid ${borderColor}` }}>

                    {/* Desktop row */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '70px 1fr 110px 110px 110px 80px 90px',
                      gap: 12, alignItems: 'center',
                    }} className="hide-mobile">
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
                        color: 'var(--violet)', background: 'var(--violet-dim)',
                        border: '1px solid var(--violet-border)', padding: '3px 8px', borderRadius: 3,
                      }}>{trace.assetSymbol}</span>

                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
                          marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', letterSpacing: '-0.01em',
                        }}>{trace.market}</div>
                        <div style={{
                          fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic',
                          fontFamily: 'var(--font-editorial)', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 300,
                        }}>{deriveEdge(trace)}</div>
                      </div>

                      <ConfidenceBadge level={trace.confidence} />
                      <SideBadge side={trace.positionIntent.side} />
                      <TraceBadge trace={trace} />
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10,
                        color: 'var(--text-tertiary)', letterSpacing: '0.04em',
                      }}>{formatRelative(trace.createdAt)}</span>
                      <span className="btn-trace">Open →</span>
                    </div>

                    {/* Mobile card */}
                    <div style={{ display: 'none' }} className="show-mobile-block">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)',
                            background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
                            padding: '2px 7px', borderRadius: 3,
                          }}>{trace.assetSymbol}</span>
                          <ConfidenceBadge level={trace.confidence} />
                          <TraceBadge trace={trace} />
                        </div>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: 'var(--text-tertiary)', flexShrink: 0,
                        }}>{formatRelative(trace.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>
                        {trace.market}
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic',
                        fontFamily: 'var(--font-editorial)', lineHeight: 1.5, marginBottom: 10, fontWeight: 300,
                      }}>{deriveEdge(trace)}</div>
                      <span className="btn-trace">Open trace →</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Footer pulse */}
        {!loadingTraces && traces.length > 0 && (
          <div style={{
            marginTop: 28, padding: '14px 20px',
            border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="live-dot" />
              <span className="mono-label" style={{ color: 'var(--lime)' }}>Agent running · Arc testnet</span>
            </div>
            <button onClick={fetchTraces} style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--text-tertiary)',
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}>↻ Refresh</button>
          </div>
        )}
      </main>

      <style>{`
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .show-mobile-block { display: block !important; }
        }
      `}</style>

      {showModal && agents.length > 0 && (
        <RunModal agents={agents} onClose={() => setShowModal(false)} onSuccess={handleRunSuccess} />
      )}
      {newTrace && <Toast trace={newTrace} onDismiss={() => setNewTrace(null)} />}
    </>
  )
}
