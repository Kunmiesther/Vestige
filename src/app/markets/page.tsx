'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { listTraces, ApiError } from '@/lib/api'
import { formatRelative, confidenceLabel, deriveEdge, sideColor, sideLabel } from '@/lib/trace-utils'
import type { ReasoningTrace, ConfidenceLevel } from '@/backend/shared/types/trace'

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className={`conviction conviction-${level}`}>{confidenceLabel(level)}</span>
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ background: 'var(--bg-card)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[70, 45, 85].map((w, j) => (
            <div key={j} style={{ height: j === 0 ? 16 : 12, width: `${w}%`, background: 'var(--border)', borderRadius: 3, animation: 'shimmer 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ))}
      <style>{`@keyframes shimmer{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>
    </div>
  )
}

export default function MarketsPage() {
  const [traces, setTraces] = useState<ReasoningTrace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<'newest' | 'conviction'>('newest')

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { traces: d } = await listTraces({ limit: 100 })
      setTraces(d)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load markets.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const sorted = [...traces].sort((a, b) => {
    if (sort === 'conviction') {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.confidence] - order[b.confidence]
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const long = traces.filter(t => t.positionIntent.side === 'long').length
  const short = traces.filter(t => t.positionIntent.side === 'short').length
  const neutral = traces.filter(t => t.positionIntent.side === 'neutral').length

  return (
    <main style={{ padding: '48px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid var(--border)' }}>
        <div className="mono-label" style={{ marginBottom: 14 }}>Open positions · Arc testnet</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,52px)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
            lineHeight: 0.95, color: 'var(--text-primary)',
          }}>
            Markets<br /><span style={{ color: 'var(--lime)' }}>Overview</span>
          </h1>

          {/* Sentiment strip */}
          <div style={{ display: 'flex', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {[
              { label: 'Long', val: long, color: 'var(--lime)' },
              { label: 'Short', val: short, color: 'var(--ember)' },
              { label: 'Neutral', val: neutral, color: 'var(--text-secondary)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-card)', padding: '14px 20px', textAlign: 'center', minWidth: 80 }}>
                <div className="mono-label" style={{ marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>
                  {loading ? '—' : s.val}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 6 }}>
        {(['newest','conviction'] as const).map(s => (
          <button key={s} onClick={() => setSort(s)} style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
            textTransform: 'uppercase', padding: '5px 12px', borderRadius: 3,
            border: '1px solid var(--border)',
            background: sort === s ? 'var(--violet-dim)' : 'transparent',
            color: sort === s ? 'var(--violet)' : 'var(--text-tertiary)', cursor: 'pointer',
          }}>{s}</button>
        ))}
      </div>

      {loading && <Skeleton />}
      {error && (
        <div style={{ border: '1px solid rgba(255,107,53,0.25)', background: 'rgba(255,107,53,0.04)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 300 }}>{error}</p>
          <button onClick={fetch} className="btn-ghost" style={{ marginTop: 12 }}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {sorted.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', padding: '60px 32px', textAlign: 'center' }}>
              <div className="mono-label" style={{ color: 'var(--text-tertiary)' }}>No markets yet — run an analysis from the dashboard.</div>
              <Link href="/dashboard" className="btn-primary" style={{ display: 'inline-flex', marginTop: 20 }}>Go to dashboard →</Link>
            </div>
          ) : sorted.map((trace, i) => (
            <Link key={trace.id} href={`/traces/${trace.id}`}>
              <div style={{
                background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-surface)',
                padding: '18px 24px', cursor: 'pointer', transition: 'background .15s',
                borderLeft: `3px solid ${sideColor(trace.positionIntent.side)}`,
                display: 'grid', gridTemplateColumns: '60px 1fr 100px 100px 80px 80px',
                gap: 16, alignItems: 'center',
              }} className="hide-mobile">
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)',
                  background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
                  padding: '2px 7px', borderRadius: 3,
                }}>{trace.assetSymbol}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {trace.market}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', fontFamily: 'var(--font-editorial)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 300 }}>
                    {deriveEdge(trace)}
                  </div>
                </div>
                <ConfidenceBadge level={trace.confidence} />
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: sideColor(trace.positionIntent.side),
                }}>{sideLabel(trace.positionIntent.side)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {formatRelative(trace.createdAt)}
                </span>
                <span className="btn-trace">View →</span>
              </div>

              {/* Mobile */}
              <div style={{ background: 'var(--bg-card)', padding: '16px', borderLeft: `3px solid ${sideColor(trace.positionIntent.side)}` }} className="show-mobile-block">
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)', background: 'var(--violet-dim)', border: '1px solid var(--violet-border)', padding: '2px 7px', borderRadius: 3 }}>{trace.assetSymbol}</span>
                  <ConfidenceBadge level={trace.confidence} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: sideColor(trace.positionIntent.side), textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sideLabel(trace.positionIntent.side)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{trace.market}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', fontFamily: 'var(--font-editorial)', fontWeight: 300 }}>{deriveEdge(trace)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style>{`
        @media(max-width:768px){.hide-mobile{display:none!important}.show-mobile-block{display:block!important}}
        .show-mobile-block{display:none}
      `}</style>
    </main>
  )
}
