import Link from 'next/link'
import { MOCK_TRACES } from '@/lib/data'
import { formatRelative, convictionLabel, statusLabel } from '@/lib/utils'
import type { Conviction, Status } from '@/types'

function ConvictionBadge({ level }: { level: Conviction }) {
  return <span className={`conviction conviction-${level}`}>{convictionLabel(level)}</span>
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>
}

export default function DashboardPage() {
  const inPosition = MOCK_TRACES.filter(t => t.status === 'in_position').length
  const watching = MOCK_TRACES.filter(t => t.status === 'watching').length

  return (
    <main style={{ padding: '48px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'flex-start',
        gap: 32,
        marginBottom: 56,
        paddingBottom: 40,
        borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <div className="mono-label" style={{ marginBottom: 14 }}>
            Market intelligence — Arc testnet
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '-0.01em',
            lineHeight: 0.95,
            color: 'var(--text-primary)',
          }}>
            Active<br />
            <span style={{ color: 'var(--violet)' }}>Traces</span>
          </h1>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          alignSelf: 'center',
        }}>
          {[
            { label: 'Total traces', val: String(MOCK_TRACES.length), color: 'var(--text-primary)' },
            { label: 'In position', val: String(inPosition), color: 'var(--lime)' },
            { label: 'Watching', val: String(watching), color: 'var(--ice)' },
            { label: 'Win rate', val: '67.4%', color: 'var(--violet)' },
          ].map((s) => (
            <div key={s.label} style={{
              background: 'var(--bg-card)',
              padding: '16px 20px',
              textAlign: 'center',
            }}>
              <div className="mono-label" style={{ marginBottom: 6 }}>{s.label}</div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 24,
                fontWeight: 700,
                color: s.color,
                lineHeight: 1,
              }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div className="mono-label">
          {MOCK_TRACES.length} traces · agent evaluating every 5 min
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['All', 'In Position', 'Watching', 'Exited'].map((f) => (
            <button key={f} style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '5px 12px',
              borderRadius: 3,
              border: '1px solid var(--border)',
              background: f === 'All' ? 'var(--violet-dim)' : 'transparent',
              color: f === 'All' ? 'var(--violet)' : 'var(--text-tertiary)',
              cursor: 'pointer',
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr 120px 120px 100px 120px',
        gap: 16,
        padding: '8px 20px',
        marginBottom: 6,
      }}>
        {['Asset', 'Market / Edge', 'Conviction', 'Status', 'Updated', ''].map((h) => (
          <div key={h} className="mono-label">{h}</div>
        ))}
      </div>

      {/* Market rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MOCK_TRACES.map((trace, idx) => (
          <Link key={trace.id} href={`/trace/${trace.id}`}>
            <div
              className="card"
              style={{
                padding: '18px 20px',
                cursor: 'pointer',
                borderLeft: trace.status === 'in_position'
                  ? '2px solid var(--lime)'
                  : trace.status === 'watching'
                  ? '2px solid var(--ice)'
                  : '2px solid transparent',
              }}
            >
              {/* Desktop layout */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 120px 120px 100px 120px',
                gap: 16,
                alignItems: 'center',
              }}>
                {/* Asset */}
                <div>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    color: 'var(--violet)',
                    background: 'var(--violet-dim)',
                    border: '1px solid var(--violet-border)',
                    padding: '3px 8px',
                    borderRadius: 3,
                  }}>{trace.asset}</span>
                </div>

                {/* Market + edge */}
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    marginBottom: 5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    letterSpacing: '-0.01em',
                  }}>{trace.market}</div>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic',
                    fontFamily: 'var(--font-editorial)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 300,
                  }}>{trace.edge}</div>
                </div>

                {/* Conviction */}
                <div><ConvictionBadge level={trace.conviction} /></div>

                {/* Status */}
                <div><StatusBadge status={trace.status} /></div>

                {/* Updated */}
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.04em',
                }}>{formatRelative(trace.updatedAt)}</div>

                {/* CTA */}
                <div>
                  <span className="btn-trace">Open trace →</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Bottom pulse */}
      <div style={{
        marginTop: 32,
        padding: '16px 20px',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="live-dot" />
          <span className="mono-label" style={{ color: 'var(--lime)' }}>
            Agent running · next evaluation in ~4 min
          </span>
        </div>
        <span className="mono-label">1,201 traces archived · Arc testnet</span>
      </div>
    </main>
  )
}
