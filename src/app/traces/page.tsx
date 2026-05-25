'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { listTraces, ApiError } from '@/lib/api'
import { useWallet } from '@/contexts/WalletContext'
import {
  formatRelative,
  formatDate,
  statusLabel,
  convictionState,
  traceAccessLabel,
  traceUnlockPrice,
  traceUnlockCount,
  truncateHash,
} from '@/lib/trace-utils'
import type { ReasoningTrace, TraceStatus } from '@/backend/shared/types/trace'

type MarketplaceView = 'latest' | 'premium' | 'unlocked' | 'most_unlocked' | 'recently_published'

function StateBadge({ trace }: { trace: ReasoningTrace }) {
  const label = trace.verdict?.action ?? convictionState(trace)
  return <span className={`conviction conviction-${trace.confidence}`}>{label}</span>
}

function AccessBadge({ trace }: { trace: ReasoningTrace }) {
  const label = traceAccessLabel(trace)
  const cls = label === 'PUBLIC' ? 'conviction-low' : label === 'PREMIUM' ? 'conviction-medium' : 'conviction-high'
  return <span className={`conviction ${cls}`}>{label}</span>
}

function StatusBadge({ status }: { status: TraceStatus }) {
  const map: Record<TraceStatus, string> = {
    draft: 'status-watching',
    stored: 'status-watching',
    failed: 'status-exited',
  }
  return <span className={`status-badge ${map[status]}`}>{statusLabel(status)}</span>
}

function UnlockedBadge({ unlocked }: { unlocked: boolean }) {
  return <span className={`conviction ${unlocked ? 'conviction-high' : 'conviction-low'}`}>{unlocked ? 'Unlocked' : 'Locked'}</span>
}

function Skeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5].map(i => (
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
  const wallet = useWallet()
  const [traces, setTraces] = useState<ReasoningTrace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<MarketplaceView>('latest')
  const [search, setSearch] = useState('')
  const activeWallet = wallet.activeAddress ?? wallet.address ?? undefined

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { traces: data } = await listTraces({ limit: 100, walletAddress: activeWallet })
      setTraces(data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load traces.')
    } finally {
      setLoading(false)
    }
  }, [activeWallet])

  useEffect(() => { fetch() }, [fetch])

  const unlockedTraceIds = useMemo(() => {
    return new Set(traces.filter(trace => walletHasConfirmedUnlock(trace, activeWallet)).map(trace => trace.id))
  }, [traces, activeWallet])

  const filtered = traces
    .filter(trace => {
      if (view === 'premium' && traceAccessLabel(trace) === 'PUBLIC') return false
      if (view === 'unlocked' && !unlockedTraceIds.has(trace.id)) return false
      if (view === 'recently_published' && !trace.publicationReceipts?.length) return false
      const q = search.trim().toLowerCase()
      return !q || trace.market.toLowerCase().includes(q) || trace.assetSymbol.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (view === 'most_unlocked') return traceUnlockCount(b) - traceUnlockCount(a)
      if (view === 'recently_published') return latestPublicationTime(b) - latestPublicationTime(a)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  return (
    <main style={{ padding: '48px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 40, paddingBottom: 36, borderBottom: '1px solid var(--border)' }}>
        <div className="mono-label" style={{ marginBottom: 14 }}>Global intelligence marketplace</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,52px)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
            lineHeight: 0.95, color: 'var(--text-primary)',
          }}>
            Trace<br /><span style={{ color: 'var(--violet)' }}>Market</span>
          </h1>
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '8px 14px',
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)',
              outline: 'none', letterSpacing: '0.02em', width: 220, maxWidth: '100%',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="mono-label">{loading ? 'Loading...' : `${filtered.length} global trace${filtered.length === 1 ? '' : 's'}`}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            ['latest', 'Latest traces'],
            ['premium', 'Premium traces'],
            ['unlocked', 'Unlocked'],
            ['most_unlocked', 'Most unlocked'],
            ['recently_published', 'Recently published'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setView(key)} style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '5px 12px', borderRadius: 3,
              border: '1px solid var(--border)',
              background: view === key ? 'var(--violet-dim)' : 'transparent',
              color: view === key ? 'var(--violet)' : 'var(--text-tertiary)', cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '60px 1fr 130px 92px 86px 90px 92px 96px',
        gap: 12, padding: '6px 20px', marginBottom: 6,
      }} className="hide-mobile">
        {['Asset', 'Question', 'Verdict', 'Creator', 'Price', 'Unlocks', 'Access', ''].map(h => (
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
            {search ? `No traces match "${search}"` : 'No traces in this view'}
          </div>
          {!search && (
            <Link href="/dashboard" className="btn-primary" style={{ display: 'inline-flex', marginTop: 16 }}>
              {'Run analysis ->'}
            </Link>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(trace => (
            <Link key={trace.id} href={`/traces/${trace.id}`}>
              <div className="card" style={{ padding: '16px 20px', cursor: 'pointer' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '60px 1fr 130px 92px 86px 90px 92px 96px',
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
                  <StateBadge trace={trace} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {trace.creatorWalletAddress ? truncateHash(trace.creatorWalletAddress, 6) : 'Unknown'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--lime)' }}>
                    {traceUnlockPrice(trace)} USDC
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                    {traceUnlockCount(trace)}
                  </span>
                  <UnlockedBadge unlocked={unlockedTraceIds.has(trace.id)} />
                  <span className="btn-trace">{'Open ->'}</span>
                </div>

                <div style={{ display: 'none' }} className="show-mobile-block">
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)', background: 'var(--violet-dim)', border: '1px solid var(--violet-border)', padding: '2px 7px', borderRadius: 3 }}>{trace.assetSymbol}</span>
                      <StateBadge trace={trace} />
                      <AccessBadge trace={trace} />
                      <StatusBadge status={trace.status} />
                      <UnlockedBadge unlocked={unlockedTraceIds.has(trace.id)} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{formatRelative(trace.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.45 }}>{trace.market}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                    {[
                      { k: 'Creator', v: trace.creatorWalletAddress ? truncateHash(trace.creatorWalletAddress, 6) : 'Unknown' },
                      { k: 'Price', v: `${traceUnlockPrice(trace)} USDC` },
                      { k: 'Unlocks', v: String(traceUnlockCount(trace)) },
                      { k: 'Published', v: trace.publicationReceipts?.length ? formatRelative(trace.publicationReceipts[0].publishedAt) : 'Not yet' },
                    ].map(item => (
                      <div key={item.k} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 10px', minWidth: 0 }}>
                        <div className="mono-label" style={{ marginBottom: 3 }}>{item.k}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: item.k === 'Price' ? 'var(--lime)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.v}</div>
                      </div>
                    ))}
                  </div>
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

function latestPublicationTime(trace: ReasoningTrace): number {
  return Math.max(0, ...(trace.publicationReceipts ?? []).map(receipt => new Date(receipt.publishedAt).getTime()))
}

function walletHasConfirmedUnlock(trace: ReasoningTrace, walletAddress?: string): boolean {
  if (!walletAddress) return false
  if (!trace.locked) return true

  const normalizedWallet = walletAddress.toLowerCase()
  return (trace.paymentReceipts ?? []).some(receipt =>
    receipt.settlementStatus === 'confirmed' &&
    receipt.payer?.toLowerCase() === normalizedWallet,
  )
}
