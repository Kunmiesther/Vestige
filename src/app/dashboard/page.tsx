'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { getMarketSnapshot, listAgents, listTraces, runAgent, ApiError } from '@/lib/api'
import { useWallet } from '@/contexts/WalletContext'
import { restoreWalletPortfolioState } from '@/lib/wallet'
import {
  formatRelative,
  deriveEdge,
  sideColor,
  sideLabel,
  traceAccessLabel,
  traceUnlockCount,
  deriveAuditMetrics,
  convictionState,
} from '@/lib/trace-utils'
import type { Agent, ReasoningTrace } from '@/lib/api'

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

// ─── Micro-badges ─────────────────────────────────────────────────────────────

function SideBadge({ trace }: { trace: ReasoningTrace }) {
  const side = trace.positionIntent.side
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
      textTransform: 'uppercase' as const, color: sideColor(side),
      background: side === 'long' ? 'var(--lime-dim)' : side === 'short' ? 'var(--ember-dim)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${side === 'long' ? 'var(--lime-border)' : side === 'short' ? 'rgba(255,107,53,0.2)' : 'var(--border)'}`,
      padding: '3px 9px', borderRadius: 3,
    }}>{sideLabel(side)}</span>
  )
}

function StateBadge({ trace }: { trace: ReasoningTrace }) {
  const label = trace.verdict?.action ?? convictionState(trace)
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
      textTransform: 'uppercase' as const, color: label.includes('HIGH') || label.includes('ACCUMULATION') ? 'var(--lime)' : label.includes('AVOID') || label.includes('DEFENSIVE') ? 'var(--ember)' : 'var(--text-secondary)',
      background: label.includes('HIGH') || label.includes('ACCUMULATION') ? 'var(--lime-dim)' : label.includes('AVOID') || label.includes('DEFENSIVE') ? 'var(--ember-dim)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${label.includes('HIGH') || label.includes('ACCUMULATION') ? 'var(--lime-border)' : label.includes('AVOID') || label.includes('DEFENSIVE') ? 'rgba(255,107,53,0.2)' : 'var(--border)'}`,
      padding: '3px 9px', borderRadius: 3,
      textAlign: 'center',
    }}>{label}</span>
  )
}

function AccessBadge({ trace }: { trace: ReasoningTrace }) {
  const label = traceAccessLabel(trace)
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: label === 'PUBLIC' ? 'var(--text-tertiary)' : 'var(--lime)',
      background: label === 'PUBLIC' ? 'rgba(255,255,255,0.03)' : 'var(--lime-dim)',
      border: `1px solid ${label === 'PUBLIC' ? 'var(--border)' : 'var(--lime-border)'}`,
      padding: '3px 9px', borderRadius: 3,
      textAlign: 'center',
    }}>{label}</span>
  )
}

// ─── Run Analysis Modal ───────────────────────────────────────────────────────

function RunModal({
  agents, onClose, onSuccess,
}: {
  agents: Agent[]
  onClose: () => void
  onSuccess: (trace: ReasoningTrace) => void
}) {
  const wallet = useWallet()
  const [agentId, setAgentId]     = useState(agents[0]?.id ?? '')
  const [market, setMarket]       = useState('')
  const [asset, setAsset]         = useState('')
  const [price, setPrice]         = useState('')
  const [headlines, setHeadlines] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [phase, setPhase]         = useState<'idle' | 'market' | 'reasoning' | 'storing'>('idle')

  async function handleRun() {
    if (!market.trim() || !asset.trim()) {
      setError('Market question and asset symbol are required.')
      return
    }
    setError(null)
    setLoading(true)
    setPhase('market')

    try {
      const symbol = asset.trim().toUpperCase()
      const snapshot = await getMarketSnapshot(symbol).catch(() => null)
      const portfolio = wallet.isConnected
        ? await restoreWalletPortfolioState().catch(() => null)
        : null
      setPhase('reasoning')
      const result = await runAgent(agentId, {
        market: market.trim(),
        assetSymbol: symbol,
        context: {
          price: price ? parseFloat(price) : snapshot?.price,
          marketSnapshot: snapshot ?? undefined,
          marketData: {
            wallet: wallet.address
              ? {
                  address: wallet.address,
                  walletType: wallet.walletType,
                  isOnArc: wallet.isOnArc,
                  usdcBalance: wallet.balance,
                }
              : undefined,
            portfolio,
          },
          headlines: headlines
            ? headlines.split('\n').map(h => h.trim()).filter(Boolean)
            : undefined,
        },
      })
      setPhase('storing')
      onSuccess(result.trace)
    } catch (err) {
      setPhase('idle')
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Unexpected error. Check the console.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const phaseLabels: Record<typeof phase, string> = {
    idle: 'Run analysis ->',
    market: 'Loading market data...',
    reasoning: 'Agent is reasoning...',
    storing: 'Storing trace...',
  }

  const iStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(5,5,7,0.8)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12,
    color: 'var(--text-primary)', outline: 'none', letterSpacing: '0.02em',
    transition: 'border-color 0.15s',
  }
  const lStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
    textTransform: 'uppercase' as const, color: 'var(--text-tertiary)',
    marginBottom: 6, display: 'block',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(5,5,7,0.9)', backdropFilter: 'blur(10px)',
      }}
      onClick={e => e.target === e.currentTarget && !loading && onClose()}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-hover)',
        borderRadius: 'var(--radius-lg)', padding: '32px 28px',
        width: '100%', maxWidth: 500,
      }}>
        <div style={{ marginBottom: 24 }}>
          <div className="mono-label" style={{ marginBottom: 8 }}>New analysis</div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)',
          }}>Run trace</h2>
        </div>

        {/* Reasoning phase indicator */}
        {loading && (
          <div style={{
            background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
            borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              display: 'inline-block', animation: 'spin 1.2s linear infinite',
              fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--violet)',
            }}>◌</span>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)', letterSpacing: '0.06em' }}>
                {phaseLabels[phase]}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {phase === 'market' && 'Fetching live Coinbase snapshot...'}
                {phase === 'reasoning' && 'Groq is generating the structured verdict...'}
                {phase === 'storing' && 'Persisting trace and position state...'}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Agent */}
          <div>
            <label style={lStyle}>Agent</label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} disabled={loading}
              style={{ ...iStyle, cursor: 'pointer' }}>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name} — {a.model} ({a.status})</option>
              ))}
            </select>
          </div>

          {/* Market */}
          <div>
            <label style={lStyle}>Market question</label>
            <input type="text" value={market} onChange={e => setMarket(e.target.value)}
              disabled={loading} placeholder="Will BTC exceed $120k before June 30, 2026?"
              style={iStyle} />
          </div>

          {/* Asset + price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lStyle}>Asset symbol</label>
              <input type="text" value={asset} onChange={e => setAsset(e.target.value)}
                disabled={loading} placeholder="BTC" style={iStyle} />
            </div>
            <div>
              <label style={lStyle}>Current price (optional)</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                disabled={loading} placeholder="108400" style={iStyle} />
            </div>
          </div>

          {/* Headlines */}
          <div>
            <label style={lStyle}>Context headlines (optional, one per line)</label>
            <textarea value={headlines} onChange={e => setHeadlines(e.target.value)}
              disabled={loading} rows={3} style={{ ...iStyle, resize: 'vertical', lineHeight: 1.7 }}
              placeholder={"ETF inflows $1.1B third consecutive week\nFed holds rates at May FOMC"} />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
              background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.22)',
              borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
            }}>{error}</div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              onClick={handleRun}
              disabled={loading}
              className="btn-primary"
              style={{
                flex: 1, justifyContent: 'center',
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {phaseLabels[phase]}
            </button>
            <button onClick={onClose} disabled={loading} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        select option { background: #0a0a12; color: #f0eff8; }
      `}</style>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[75, 50].map((w, j) => (
                <div key={j} style={{
                  height: j === 0 ? 14 : 11, width: `${w}%`,
                  background: 'var(--border)', borderRadius: 3,
                  animation: 'shimmer 1.5s ease-in-out infinite',
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {[60, 80].map((w, j) => (
                <div key={j} style={{
                  height: 22, width: w, background: 'var(--border)',
                  borderRadius: 3, animation: 'shimmer 1.5s ease-in-out infinite',
                }} />
              ))}
            </div>
          </div>
        </div>
      ))}
      <style>{`@keyframes shimmer{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ trace, onDismiss }: { trace: ReasoningTrace; onDismiss: () => void }) {
  // Auto-dismiss after 8s
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 300,
      background: 'var(--bg-card)', border: '1px solid var(--lime-border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 20px',
      maxWidth: 340, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      animation: 'slideUp 0.3s ease-out',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--lime)', marginBottom: 6,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span className="live-dot" /> Trace generated
      </div>
      <p style={{
        fontSize: 13, color: 'var(--text-primary)', marginBottom: 12,
        lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{trace.market}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Link href={`/traces/${trace.id}`} className="btn-trace"
          style={{ flex: 1, justifyContent: 'center' }}>
          View trace →
        </Link>
        <button onClick={onDismiss} className="btn-ghost" style={{ padding: '6px 12px' }}>✕</button>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  )
}

// ─── Trace row ────────────────────────────────────────────────────────────────

function TraceRow({ trace, isNew }: { trace: ReasoningTrace; isNew: boolean }) {
  const side = trace.positionIntent.side
  const borderColor = side === 'long' ? 'var(--lime)' : side === 'short' ? 'var(--ember)' : 'transparent'

  return (
    <Link href={`/traces/${trace.id}`}>
      <div
        className="card"
        style={{
          padding: '18px 20px', cursor: 'pointer',
          borderLeft: `2px solid ${borderColor}`,
          animation: isNew ? 'fadeIn 0.4s ease-out' : 'none',
        }}
      >
        {/* Desktop grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr 150px 110px 100px 80px 90px',
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

          <StateBadge trace={trace} />
          <SideBadge trace={trace} />
          <AccessBadge trace={trace} />

          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.06em', textTransform: 'uppercase',
          color: trace.status === 'stored' ? 'var(--lime)' : trace.status === 'failed' ? 'var(--ember)' : 'var(--text-tertiary)',
          }}>
            {trace.status === 'stored' ? 'Stored' : trace.status}
          </span>

          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--text-tertiary)', letterSpacing: '0.04em',
          }}>{formatRelative(trace.createdAt)}</span>

          <span className="btn-trace">Open →</span>
        </div>

        {/* Mobile card */}
        <div style={{ display: 'none' }} className="show-mobile-block">
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', marginBottom: 8, gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)',
                background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
                padding: '2px 7px', borderRadius: 3,
              }}>{trace.assetSymbol}</span>
              <StateBadge trace={trace} />
              <SideBadge trace={trace} />
              <AccessBadge trace={trace} />
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-tertiary)', flexShrink: 0,
            }}>{formatRelative(trace.createdAt)}</span>
          </div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
            marginBottom: 4, lineHeight: 1.4,
          }}>{trace.market}</div>
          <div style={{
            fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic',
            fontFamily: 'var(--font-editorial)', lineHeight: 1.5,
            marginBottom: 10, fontWeight: 300,
          }}>{deriveEdge(trace)}</div>
          <span className="btn-trace">Open trace →</span>
        </div>
      </div>
    </Link>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type Filter = 'all' | 'long' | 'short' | 'neutral'

export default function DashboardPage() {
  const [agents, setAgents]             = useState<Agent[]>([])
  const [traces, setTraces]             = useState<ReasoningTrace[]>([])
  const [newTraceIds, setNewTraceIds]   = useState<Set<string>>(new Set())
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loadingTraces, setLoadingTraces] = useState(true)
  const [agentsError, setAgentsError]   = useState<string | null>(null)
  const [tracesError, setTracesError]   = useState<string | null>(null)
  const [showModal, setShowModal]       = useState(false)
  const [toast, setToast]               = useState<ReasoningTrace | null>(null)
  const [filter, setFilter]             = useState<Filter>('all')
  const refreshRef                      = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true); setAgentsError(null)
    try { setAgents(await listAgents()) }
    catch (e) { setAgentsError(e instanceof ApiError ? e.message : 'Failed to load agents.') }
    finally { setLoadingAgents(false) }
  }, [])

  const fetchTraces = useCallback(async (silent = false) => {
    if (!silent) setLoadingTraces(true)
    setTracesError(null)
    try {
      const { traces: data } = await listTraces({ limit: 50 })
      setTraces(data)
    } catch (e) {
      setTracesError(e instanceof ApiError ? e.message : 'Failed to load traces.')
    } finally {
      if (!silent) setLoadingTraces(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
    fetchTraces()
    // Silent background refresh every 30s
    refreshRef.current = setInterval(() => fetchTraces(true), 30000)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [fetchAgents, fetchTraces])

  function handleRunSuccess(trace: ReasoningTrace) {
    setShowModal(false)
    setToast(trace)
    setTraces(prev => [trace, ...prev])
    setNewTraceIds(prev => new Set([...prev, trace.id]))
    // Clear "new" highlight after 5s
    setTimeout(() => {
      setNewTraceIds(prev => { const s = new Set(prev); s.delete(trace.id); return s })
    }, 5000)
  }

  const filtered = traces.filter(t => {
    if (filter === 'all') return true
    return t.positionIntent.side === filter
  })

  const receipts = traces.flatMap(trace => trace.paymentReceipts ?? [])
  const totalUsdc = receipts.reduce((sum, receipt) => sum + (Number.parseFloat(receipt.amount) || 0), 0)
  const paidUnlocks = receipts.length || traces.reduce((sum, trace) => sum + traceUnlockCount(trace), 0)
  const activeAnalysts = agents.filter(agent => agent.status === 'active').length
  const convictionStates = traces.map(convictionState)
  const dominantConviction = mostCommon(convictionStates) ?? 'No traces'
  const marketRegime = mostCommon(traces.map(trace => deriveAuditMetrics(trace).marketRegime)) ?? 'No regime'
  const highestDemandTrace = traces
    .filter(trace => traceUnlockCount(trace) > 0)
    .sort((a, b) => traceUnlockCount(b) - traceUnlockCount(a))[0]
  const recentPaidActivity = receipts
    .slice()
    .sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime())
    .slice(0, 3)

  return (
    <>
      <main style={{ padding: '48px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Page header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto',
          alignItems: 'flex-start', gap: 24, marginBottom: 48,
          paddingBottom: 40, borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div className="mono-label" style={{ marginBottom: 14 }}>
              Prediction market intelligence
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,52px)',
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
              lineHeight: 0.95, color: 'var(--text-primary)',
            }}>
              Active<br /><span style={{ color: 'var(--violet)' }}>Traces</span>
            </h1>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
            {/* Run Analysis button */}
            <button
              onClick={() => setShowModal(true)}
              disabled={loadingAgents || agents.length === 0}
              className="btn-primary"
              style={{
                opacity: loadingAgents ? 0.5 : 1,
                cursor: loadingAgents || agents.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {loadingAgents
                ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span> Loading…</>
                : '+ Run analysis'
              }
            </button>

            {/* Stats strip */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1,
              background: 'var(--border)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            }}>
              {[
                { label: 'USDC processed', val: totalUsdc.toFixed(2), color: 'var(--lime)' },
                { label: 'Paid unlocks', val: paidUnlocks, color: 'var(--violet)' },
                { label: 'Analysts', val: activeAnalysts, color: 'var(--text-primary)' },
                { label: 'Regime', val: marketRegime, color: 'var(--text-secondary)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg-card)', padding: '12px 16px', textAlign: 'center' }}>
                  <div className="mono-label" style={{ marginBottom: 4 }}>{s.label}</div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
                    color: s.color, lineHeight: 1,
                  }}>{loadingTraces ? '—' : s.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
          gap: 1, background: 'var(--border)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 28,
        }}>
          {[
            { label: 'Conviction state', val: dominantConviction },
            { label: 'Market regime', val: marketRegime },
            { label: 'Highest demand', val: highestDemandTrace ? `${highestDemandTrace.assetSymbol} / ${traceUnlockCount(highestDemandTrace)} unlocks` : 'No paid unlocks yet' },
            { label: 'Recent paid activity', val: recentPaidActivity[0] ? `${recentPaidActivity[0].amount} ${recentPaidActivity[0].asset} on ${recentPaidActivity[0].network}` : 'No paid unlocks yet' },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--bg-card)', padding: '14px 16px' }}>
              <div className="mono-label" style={{ marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {loadingTraces ? '---' : item.val}
              </div>
            </div>
          ))}
        </div>

        {recentPaidActivity.length > 0 && (
          <div className="card" style={{ padding: '14px 18px', marginBottom: 24 }}>
            <div className="mono-label" style={{ marginBottom: 10 }}>Protocol activity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentPaidActivity.map(receipt => (
                <div key={receipt.receiptId} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Wallet {receipt.payer ? `${receipt.payer.slice(0, 6)}...${receipt.payer.slice(-4)}` : 'unknown'} unlocked a premium trace for {receipt.amount} {receipt.asset}
                  {receipt.txHash ? ` / ${receipt.txHash.slice(0, 10)}...` : ''}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agents error */}
        {agentsError && (
          <div style={{
            border: '1px solid rgba(255,107,53,0.25)', background: 'rgba(255,107,53,0.04)',
            borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 300 }}>
              Agent load error: {agentsError}
            </p>
            <button onClick={fetchAgents} className="btn-ghost">Retry</button>
          </div>
        )}

        {/* Filter + count row */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 16,
          flexWrap: 'wrap', gap: 12,
        }}>
          <div className="mono-label">
            {loadingTraces ? 'Loading traces…' : `${filtered.length} trace${filtered.length !== 1 ? 's' : ''}`}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all','long','short','neutral'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '5px 12px', borderRadius: 3,
                border: '1px solid var(--border)',
                background: filter === f ? 'var(--violet-dim)' : 'transparent',
                color: filter === f ? 'var(--violet)' : 'var(--text-tertiary)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>{f}</button>
            ))}
          </div>
        </div>

        {/* Column headers — desktop */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr 150px 110px 100px 80px 90px',
          gap: 12, padding: '6px 20px', marginBottom: 6,
        }} className="hide-mobile">
          {['Asset','Market / Edge','State','Side','Access','Age',''].map(h => (
            <div key={h} className="mono-label">{h}</div>
          ))}
        </div>

        {/* Traces error */}
        {tracesError && !loadingTraces && (
          <div style={{
            border: '1px solid rgba(255,107,53,0.25)', background: 'rgba(255,107,53,0.04)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 300 }}>{tracesError}</p>
            <button onClick={() => fetchTraces()} className="btn-ghost">Retry</button>
          </div>
        )}

        {/* Loading skeletons */}
        {loadingTraces && <Skeleton />}

        {/* Empty state */}
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
            <p style={{
              fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 24, fontWeight: 300,
            }}>
              {filter !== 'all'
                ? `No ${filter} positions found. Try a different filter.`
                : 'Run an analysis to generate your first reasoning trace.'
              }
            </p>
            {filter === 'all' && agents.length > 0 && (
              <button onClick={() => setShowModal(true)} className="btn-primary">
                + Run analysis
              </button>
            )}
          </div>
        )}

        {/* Trace list */}
        {!loadingTraces && !tracesError && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(trace => (
              <TraceRow
                key={trace.id}
                trace={trace}
                isNew={newTraceIds.has(trace.id)}
              />
            ))}
          </div>
        )}

        {/* Footer pulse */}
        {!loadingTraces && traces.length > 0 && (
          <div style={{
            marginTop: 28, padding: '14px 20px',
            border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="live-dot" />
              <span className="mono-label" style={{ color: 'var(--lime)' }}>
                Agent running · refreshes every 30s
              </span>
            </div>
            <button
              onClick={() => fetchTraces()}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-tertiary)',
                background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0',
              }}
            >↻ Refresh now</button>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @media(max-width:768px){
          .hide-mobile{display:none!important}
          .show-mobile-block{display:block!important}
        }
        .show-mobile-block{display:none}
      `}</style>

      {/* Run modal */}
      {showModal && agents.length > 0 && (
        <RunModal
          agents={agents}
          onClose={() => setShowModal(false)}
          onSuccess={handleRunSuccess}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast trace={toast} onDismiss={() => setToast(null)} />
      )}
    </>
  )
}
