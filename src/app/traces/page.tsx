'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { listTraces, ApiError } from '@/lib/api'
import { formatRelative, formatDate, confidenceLabel, statusLabel } from '@/lib/trace-utils'
import type { ReasoningTrace, ConfidenceLevel, TraceStatus } from '@/backend/shared/types/trace'

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return <span className={`conviction conviction-${level}`}>{confidenceLabel(level)}</span>
}

function StatusBadge({ status }: { status: TraceStatus }) {
  const map: Record<TraceStatus, string> = {
    draft: 'status-watching', stored: 'status-watching',
    failed: 'status-exited',
  }
  return <span className={`status-badge ${map[status]}`}>{statusLabel(status)}</span>
}

function Skeleton() {
  return (
    <>
      {[1,2,3,4,5].map(i => (
        <div key={i} className="card" style={{ padding: '16px 20px', marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[75, 50].map((w, j) => (
                <div key={j} style={{ height: j === 0 ? 14 : 11, width: `${w}%`, background: 'var(--border)', borderRadius: 3, animation: 'shimmer 1.5s ease-in-out infinite' }} />
              ))}
            </div>
            <div style={{ width: 80, height: 24, background: 'var(--border)', borderRadius: 3, animation: 'shimmer 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      ))}
      <style>{`@keyframes shimmer{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>
    </>
  )
}

export default function TracesPage() {
  const [traces, setTraces] = useState<ReasoningTrace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'stored' | 'failed'>('all')
  const [search, setSearch] = useState('')

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { traces: d } = await listTraces({ limit: 100 })
      setTraces(d)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load traces.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const filtered = traces.filter(t => {
    const matchFilter =
      filter === 'all' ||
      t.status === filter
    const matchSearch = !search || t.market.toLowerCase().includes(search.toLowerCase()) || t.assetSymbol.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  return (
    <main style={{ padding: '48px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 40, paddingBottom: 36, borderBottom: '1px solid var(--border)' }}>
        <div className="mono-label" style={{ marginBottom: 14 }}>Reasoning archive</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,52px)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
            lineHeight: 0.95, color: 'var(--text-primary)',
          }}>
            All<br /><span style={{ color: 'var(--violet)' }}>Traces</span>
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search markets…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '8px 14px',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)',
                outline: 'none', letterSpacing: '0.02em', width: 200,
              }}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="mono-label">{loading ? 'Loading…' : `${filtered.length} trace${filtered.length !== 1 ? 's' : ''}`}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all','stored','failed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '5px 12px', borderRadius: 3,
              border: '1px solid var(--border)',
              background: filter === f ? 'var(--violet-dim)' : 'transparent',
              color: filter === f ? 'var(--violet)' : 'var(--text-tertiary)', cursor: 'pointer',
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '60px 1fr 110px 100px 90px 100px',
        gap: 12, padding: '6px 20px', marginBottom: 6,
      }} className="hide-mobile">
        {['Asset','Market','Confidence','Status','Age',''].map(h => (
          <div key={h} className="mono-label">{h}</div>
        ))}
      </div>

      {loading && <Skeleton />}

      {error && (
        <div style={{ border: '1px solid rgba(255,107,53,0.25)', background: 'rgba(255,107,53,0.04)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 300 }}>{error}</p>
          <button onClick={fetch} className="btn-ghost" style={{ marginTop: 12 }}>Retry</button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '60px 32px', textAlign: 'center' }}>
          <div className="mono-label" style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>
            {search ? `No traces match "${search}"` : 'No traces yet'}
          </div>
          {!search && (
            <Link href="/dashboard" className="btn-primary" style={{ display: 'inline-flex', marginTop: 16 }}>
              Run analysis →
            </Link>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(trace => (
            <Link key={trace.id} href={`/traces/${trace.id}`}>
              <div className="card" style={{ padding: '16px 20px', cursor: 'pointer' }}>
                {/* Desktop */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '60px 1fr 110px 100px 90px 100px',
                  gap: 12, alignItems: 'center',
                }} className="hide-mobile">
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)',
                    background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
                    padding: '2px 7px', borderRadius: 3,
                  }}>{trace.assetSymbol}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {trace.market}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3, letterSpacing: '0.04em' }}>
                      {formatDate(trace.createdAt)}
                    </div>
                  </div>
                  <ConfidenceBadge level={trace.confidence} />
                  <StatusBadge status={trace.status} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {formatRelative(trace.createdAt)}
                  </span>
                  <span className="btn-trace">Open →</span>
                </div>

                {/* Mobile */}
                <div style={{ display: 'none' }} className="show-mobile-block">
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)', background: 'var(--violet-dim)', border: '1px solid var(--violet-border)', padding: '2px 7px', borderRadius: 3 }}>{trace.assetSymbol}</span>
                      <ConfidenceBadge level={trace.confidence} />
                      <StatusBadge status={trace.status} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>{formatRelative(trace.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{trace.market}</div>
                </div>
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
