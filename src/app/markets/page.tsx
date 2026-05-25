'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getMarketSnapshot, listPositions, listTraces, syncPositions, ApiError, type MarketSnapshot, type Position } from '@/lib/api'
import { useWallet } from '@/contexts/WalletContext'
import { loadWalletWatchlist, saveWalletWatchlist } from '@/lib/wallet'
import { formatRelative, convictionState, deriveEdge, sideColor, sideLabel, traceAccessLabel } from '@/lib/trace-utils'
import type { ReasoningTrace } from '@/backend/shared/types/trace'

function StateBadge({ trace }: { trace: ReasoningTrace }) {
  const label = trace.verdict?.action ?? convictionState(trace)
  return <span className={`conviction conviction-${trace.confidence}`}>{label}</span>
}

function AccessBadge({ trace }: { trace: ReasoningTrace }) {
  const label = traceAccessLabel(trace)
  return <span className={`conviction ${label === 'PUBLIC' ? 'conviction-low' : label === 'PREMIUM' ? 'conviction-medium' : 'conviction-high'}`}>{label}</span>
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Timed out')), ms)
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeout))
  })
}

export default function MarketsPage() {
  const wallet = useWallet()
  const [traces, setTraces] = useState<ReasoningTrace[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [watchSnapshots, setWatchSnapshots] = useState<MarketSnapshot[]>([])
  const [watchInput, setWatchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [watchLoading, setWatchLoading] = useState(false)
  const [watchError, setWatchError] = useState<string | null>(null)
  const [watchRetryNonce, setWatchRetryNonce] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<'newest' | 'positioning'>('newest')
  const activeWallet = wallet.activeAddress ?? wallet.address ?? undefined

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [{ traces: d }, synced] = await Promise.all([
        listTraces({ limit: 100, walletAddress: activeWallet }),
        syncPositions().catch(() => null),
      ])
      setTraces(d)
      setPositions(synced ?? await listPositions({ isOpen: true }).catch(() => []))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load markets.')
    } finally {
      setLoading(false)
    }
  }, [activeWallet])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    if (!wallet.address) {
      setWatchlist([])
      setWatchSnapshots([])
      return
    }
    setWatchlist(loadWalletWatchlist(wallet.address))
  }, [wallet.address])

  useEffect(() => {
    let cancelled = false
    async function loadSnapshots() {
      if (watchlist.length === 0) {
        setWatchSnapshots([])
        setWatchLoading(false)
        setWatchError(null)
        return
      }
      setWatchLoading(true)
      setWatchError(null)
      try {
        const snapshots = await Promise.all(
          watchlist.map(symbol => withTimeout(getMarketSnapshot(symbol), 8000).catch(() => null)),
        )
        if (!cancelled) {
          const live = snapshots.filter((snapshot): snapshot is MarketSnapshot => Boolean(snapshot))
          setWatchSnapshots(live)
          if (live.length < watchlist.length) setWatchError('Some watchlist assets have no live quote yet.')
        }
      } catch {
        if (!cancelled) {
          setWatchSnapshots([])
          setWatchError('Watchlist quotes timed out.')
        }
      } finally {
        if (!cancelled) setWatchLoading(false)
      }
    }
    loadSnapshots()
    return () => { cancelled = true }
  }, [watchlist, watchRetryNonce])

  function addWatchSymbol() {
    if (!wallet.address) return
    const updated = saveWalletWatchlist(wallet.address, [...watchlist, watchInput])
    setWatchlist(updated)
    setWatchInput('')
  }

  function removeWatchSymbol(symbol: string) {
    if (!wallet.address) return
    setWatchlist(saveWalletWatchlist(wallet.address, watchlist.filter(item => item !== symbol)))
  }

  const sorted = [...traces].sort((a, b) => {
    if (sort === 'positioning') {
      return (b.verdict?.score ?? 0) - (a.verdict?.score ?? 0)
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const long = traces.filter(t => t.positionIntent.side === 'long').length
  const short = traces.filter(t => t.positionIntent.side === 'short').length
  const neutral = traces.filter(t => t.positionIntent.side === 'neutral').length
  const openExposure = positions.filter(position => position.isOpen)
  const usdcBalance = Number.parseFloat(wallet.balance ?? '0') || 0
  const concentration = openExposure.length > 0 ? Math.round((1 / openExposure.length) * 100) : 0

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
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)',
        gap: 16,
        marginBottom: 24,
      }} className="markets-live-grid">
        <div className="card" style={{ padding: '18px 20px' }}>
          <div className="mono-label" style={{ marginBottom: 12 }}>Wallet exposure</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {[
              { label: 'USDC', val: wallet.isConnected ? usdcBalance.toFixed(2) : 'Connect' },
              { label: 'Open', val: String(openExposure.length) },
              { label: 'Max conc.', val: openExposure.length ? `${concentration}%` : '0%' },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--bg-card)', padding: '12px 14px' }}>
                <div className="mono-label" style={{ marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{item.val}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div className="mono-label" style={{ marginBottom: 0 }}>Watchlist</div>
            {watchLoading && <span className="mono-label" style={{ color: 'var(--violet)', marginBottom: 0 }}>Live</span>}
          </div>
          {wallet.address ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={watchInput}
                  onChange={e => setWatchInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') addWatchSymbol() }}
                  placeholder="BTC"
                  style={{
                    flex: 1,
                    background: 'rgba(5,5,7,0.8)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '8px 10px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <button onClick={addWatchSymbol} className="btn-ghost" style={{ padding: '8px 12px' }}>Add</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {watchlist.length === 0 && (
                  <div className="mono-label" style={{ color: 'var(--text-tertiary)', marginBottom: 0 }}>No tracked assets</div>
                )}
                {watchError && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ember)',
                    background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.22)',
                    borderRadius: 'var(--radius)', padding: '8px 10px',
                  }}>
                    <span>{watchError}</span>
                    <button onClick={() => setWatchRetryNonce(value => value + 1)} style={{
                      background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                      cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10,
                    }}>Retry</button>
                  </div>
                )}
                {watchlist.map(symbol => {
                  const snapshot = watchSnapshots.find(item => item.symbol === symbol)
                  return (
                    <div key={symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)' }}>{symbol}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: snapshot?.change24hPercent && snapshot.change24hPercent < 0 ? 'var(--ember)' : 'var(--lime)' }}>
                        {snapshot ? `$${snapshot.price.toLocaleString()} ${snapshot.change24hPercent ?? 0}%` : watchLoading ? 'Loading' : 'No data yet'}
                      </span>
                      <button onClick={() => removeWatchSymbol(symbol)} style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                      }}>Remove</button>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="mono-label" style={{ color: 'var(--text-tertiary)', marginBottom: 0 }}>Connect wallet to persist a watchlist</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 6 }}>
        {(['newest','positioning'] as const).map(s => (
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
                display: 'grid', gridTemplateColumns: '60px 1fr 100px 92px 100px 80px 80px',
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
                <StateBadge trace={trace} />
                <AccessBadge trace={trace} />
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
                  <StateBadge trace={trace} />
                  <AccessBadge trace={trace} />
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
        @media(max-width:900px){.markets-live-grid{grid-template-columns:1fr!important}}
        .show-mobile-block{display:none}
      `}</style>
    </main>
  )
}
