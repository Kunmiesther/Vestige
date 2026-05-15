import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTrace } from '@/lib/data'
import {
  formatDate, formatRelative,
  convictionLabel, statusLabel, arcStatusLabel, truncateHash
} from '@/lib/utils'
import type { Conviction, Status, ArcPublishStatus } from '@/types'

function ConvictionBadge({ level }: { level: Conviction }) {
  return <span className={`conviction conviction-${level}`}>{convictionLabel(level)}</span>
}
function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>
}
function ArcBadge({ status }: { status: ArcPublishStatus }) {
  return (
    <span className={`arc-badge ${status === 'published' ? 'arc-published' : 'arc-pending'}`}>
      {status === 'published' ? '✓' : '◌'} {arcStatusLabel(status)}
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono-label" style={{ marginBottom: 14 }}>{children}</div>
  )
}

function Block({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={{ padding: '20px 22px', ...style }}>
      {children}
    </div>
  )
}

export default function TraceDetailPage({ params }: { params: { id: string } }) {
  const trace = getTrace(params.id)
  if (!trace) notFound()

  const roleLabel = (r: string) =>
    r === 'researcher' ? 'Researcher'
    : r === 'risk_manager' ? 'Risk Manager'
    : 'Portfolio Manager'

  return (
    <main style={{ padding: '40px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 36,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
      }}>
        <Link href="/dashboard" style={{ color: 'var(--text-tertiary)', transition: 'color .15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--violet)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >Dashboard</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{trace.asset}</span>
        <span>/</span>
        <span style={{
          maxWidth: 260,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{trace.id}</span>
      </div>

      {/* Header block */}
      <div style={{
        marginBottom: 48,
        paddingBottom: 40,
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Badges row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--violet)',
            background: 'var(--violet-dim)',
            border: '1px solid var(--violet-border)',
            padding: '3px 10px',
            borderRadius: 3,
          }}>{trace.asset}</span>
          <ConvictionBadge level={trace.conviction} />
          <StatusBadge status={trace.status} />
          <ArcBadge status={trace.arcPublishStatus} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.06em',
            marginLeft: 'auto',
          }}>Updated {formatRelative(trace.updatedAt)}</span>
        </div>

        {/* Market title */}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(22px, 3.5vw, 40px)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '-0.01em',
          lineHeight: 1.1,
          color: 'var(--text-primary)',
          marginBottom: 24,
        }}>{trace.market}</h1>

        {/* Edge callout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '3px 1fr',
          gap: 16,
        }}>
          <div style={{ background: 'var(--lime)', borderRadius: 2 }} />
          <div>
            <div className="mono-label" style={{ color: 'var(--lime)', marginBottom: 6 }}>Edge</div>
            <p style={{
              fontFamily: 'var(--font-editorial)',
              fontStyle: 'italic',
              fontSize: 17,
              color: 'var(--text-primary)',
              lineHeight: 1.6,
              fontWeight: 300,
            }}>{trace.edge}</p>
          </div>
        </div>
      </div>

      {/* Two column layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 300px',
        gap: 20,
        alignItems: 'start',
      }}>

        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Thesis */}
          <Block>
            <SectionLabel>Thesis</SectionLabel>
            <p style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              lineHeight: 1.85,
              fontWeight: 300,
            }}>{trace.thesis}</p>
          </Block>

          {/* Conclusion */}
          <Block style={{ borderColor: 'rgba(179,136,255,0.18)', background: 'rgba(10,10,20,0.9)' }}>
            <SectionLabel>Conclusion</SectionLabel>
            <p style={{
              fontFamily: 'var(--font-editorial)',
              fontStyle: 'italic',
              fontSize: 16,
              color: 'var(--text-primary)',
              lineHeight: 1.75,
              fontWeight: 300,
            }}>{trace.conclusion}</p>
          </Block>

          {/* Edge narrative */}
          <Block>
            <SectionLabel>Edge narrative</SectionLabel>
            <p style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.85,
              fontWeight: 300,
            }}>{trace.edgeNarrative}</p>
          </Block>

          {/* Reasoning chain */}
          <div>
            <SectionLabel>Reasoning chain</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {trace.reasoningSteps.map((step) => (
                <div key={step.step} className="card" style={{
                  padding: '16px 18px',
                  borderLeft: `2px solid ${
                    step.role === 'researcher' ? 'var(--violet)'
                    : step.role === 'risk_manager' ? 'var(--ember)'
                    : 'var(--lime)'
                  }`,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        letterSpacing: '0.12em',
                        color: 'var(--text-tertiary)',
                        textTransform: 'uppercase',
                      }}>Step {step.step}</span>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fontWeight: 500,
                      }} className={`role-${step.role}`}>{roleLabel(step.role)}</span>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.04em',
                    }}>{formatRelative(step.timestamp)}</span>
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.8,
                    fontWeight: 400,
                  }}>{step.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence */}
          <div>
            <SectionLabel>Evidence</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {trace.evidence.map((ev, i) => (
                <div key={i} className={`card evidence-${ev.weight}`} style={{ padding: '14px 18px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 4,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: '0.04em',
                      color: ev.weight === 'supporting'
                        ? 'var(--lime)'
                        : ev.weight === 'contradicting'
                        ? 'var(--ember)'
                        : 'var(--text-secondary)',
                    }}>{ev.label}</span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}>{ev.source}</span>
                  </div>
                  <p style={{
                    fontSize: 12,
                    color: 'var(--text-tertiary)',
                    lineHeight: 1.6,
                    fontWeight: 300,
                  }}>{ev.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* What would invalidate this — required section */}
          <Block style={{
            borderColor: 'rgba(255,107,53,0.2)',
            background: 'rgba(255,107,53,0.02)',
          }}>
            <SectionLabel>What would invalidate this thesis?</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {trace.invalidationCriteria.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--ember)',
                    flexShrink: 0,
                    marginTop: 3,
                  }}>✕</span>
                  <p style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.65,
                    fontWeight: 300,
                  }}>{c}</p>
                </div>
              ))}
            </div>
          </Block>

          {/* Risks */}
          <Block>
            <SectionLabel>Risks</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {trace.risks.map((risk, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--violet)',
                    flexShrink: 0,
                    marginTop: 3,
                  }}>⚠</span>
                  <p style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.65,
                    fontWeight: 300,
                  }}>{risk}</p>
                </div>
              ))}
            </div>
          </Block>

        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Position intent */}
          <Block>
            <SectionLabel>Position intent</SectionLabel>
            <p style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.75,
              fontWeight: 300,
            }}>{trace.positionIntent}</p>
          </Block>

          {/* Status timeline */}
          <Block>
            <SectionLabel>Status timeline</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {trace.statusTimeline.map((event, i) => (
                <div key={i} style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  paddingBottom: i < trace.statusTimeline.length - 1 ? 20 : 0,
                  position: 'relative',
                }}>
                  {i < trace.statusTimeline.length - 1 && (
                    <div style={{
                      position: 'absolute',
                      left: 6,
                      top: 14,
                      bottom: 0,
                      width: 1,
                      background: 'var(--border)',
                    }} />
                  )}
                  <div className={`timeline-dot ${event.status === trace.status ? 'active' : ''}`} />
                  <div style={{ minWidth: 0 }}>
                    <StatusBadge status={event.status} />
                    <p style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      marginTop: 5,
                      lineHeight: 1.55,
                      fontWeight: 300,
                    }}>{event.note}</p>
                    <p style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--text-tertiary)',
                      marginTop: 3,
                      letterSpacing: '0.04em',
                    }}>{formatDate(event.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Block>

          {/* Arc verification */}
          <Block style={{ background: 'rgba(5,5,7,0.9)' }}>
            <SectionLabel>Arc verification</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ArcBadge status={trace.arcPublishStatus} />

              <div>
                <div className="mono-label" style={{ marginBottom: 5 }}>Trace hash</div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  wordBreak: 'break-all',
                  lineHeight: 1.6,
                  letterSpacing: '0.02em',
                }}>{truncateHash(trace.traceHash, 18)}</div>
              </div>

              {trace.arcTxHash && (
                <div>
                  <div className="mono-label" style={{ marginBottom: 5 }}>Arc tx</div>
                  <a
                    href={`https://testnet.arcscan.app/tx/${trace.arcTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--lime)',
                      letterSpacing: '0.02em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'opacity .15s',
                    }}
                  >
                    {truncateHash(trace.arcTxHash)} ↗
                  </a>
                </div>
              )}

              {trace.publishedAt && (
                <div>
                  <div className="mono-label" style={{ marginBottom: 5 }}>Published</div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.02em',
                  }}>{formatDate(trace.publishedAt)}</div>
                </div>
              )}

              <div style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}>
                {[
                  ['Network', 'Arc Testnet'],
                  ['Chain ID', '5042002'],
                  ['Gas token', 'USDC'],
                  ['Finality', 'Sub-second'],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.04em',
                  }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>{k}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </Block>

          {/* Back */}
          <Link href="/dashboard" className="btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
            ← Back to dashboard
          </Link>
        </div>

      </div>
    </main>
  )
}
