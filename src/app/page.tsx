import Link from 'next/link'

export default function HomePage() {
  return (
    <main>

      {/* ── HERO ── */}
      <section style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px 32px 60px',
        maxWidth: 1200,
        margin: '0 auto',
        position: 'relative',
      }}>

        {/* Ticker tape top */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          marginBottom: 56,
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'Arc Testnet', val: 'Chain 5042002' },
            { label: 'Settlement', val: 'USDC' },
            { label: 'Traces', val: 'Live archive' },
            { label: 'Win rate', val: 'Measured live' },
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
              }}>{t.label}</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.06em',
                color: 'var(--violet)',
              }}>{t.val}</span>
              {i < 3 && <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>·</span>}
            </div>
          ))}
        </div>

        {/* Main headline */}
        <div style={{ marginBottom: 40, overflow: 'hidden' }}>
          <h1
            className="display-xl"
            style={{
              fontSize: 'clamp(64px, 11vw, 148px)',
              color: 'var(--text-primary)',
              marginBottom: 0,
            }}
          >
            The AI<br />
            <span style={{ color: 'var(--violet)' }}>shows</span>{' '}
            <span className="editorial" style={{
              fontSize: 'clamp(52px, 9vw, 120px)',
              color: 'var(--text-secondary)',
              display: 'inline-block',
              verticalAlign: 'baseline',
              textTransform: 'none',
              letterSpacing: '-0.02em',
            }}>its work.</span>
          </h1>
        </div>

        {/* Subhead + CTA row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 40,
          alignItems: 'flex-end',
          marginBottom: 80,
        }}>
          <div>
            <p style={{
              fontSize: 'clamp(16px, 2vw, 20px)',
              fontWeight: 300,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              maxWidth: 520,
              fontFamily: 'var(--font-editorial)',
              fontStyle: 'italic',
            }}>
              Vestige stores every reasoning step before entering a position.
              Thesis, evidence, edge, risks - stored as an audit trail before the trade.
              You see the logic. Then you decide.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            <Link href="/dashboard" className="btn-primary">
              Open dashboard →
            </Link>
            <Link href="/dashboard" className="btn-ghost" style={{ justifyContent: 'center' }}>
              View live traces
            </Link>
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          background: 'rgba(10,10,18,0.6)',
          backdropFilter: 'blur(12px)',
        }}>
          {[
            { label: 'Open markets', val: 'Live', color: 'var(--text-primary)' },
            { label: 'Premium traces', val: 'USDC gated', color: 'var(--violet)' },
            { label: 'Agent win rate', val: 'Tracked', color: 'var(--lime)' },
            { label: 'USDC unlocks', val: 'Measured', color: 'var(--text-primary)' },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: '24px 28px',
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <div className="mono-label" style={{ marginBottom: 10 }}>{s.label}</div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(24px, 3vw, 36px)',
                fontWeight: 700,
                color: s.color,
                letterSpacing: '-0.01em',
                lineHeight: 1,
              }}>{s.val}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <hr className="ruled" style={{ maxWidth: 1200, margin: '0 auto' }} />

      {/* ── WHAT IT IS ── */}
      <section style={{ padding: '100px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 80,
          alignItems: 'start',
        }}>
          <div>
            <div className="mono-label" style={{ marginBottom: 16 }}>001 — What is Vestige</div>
            <div style={{
              width: 40, height: 1,
              background: 'var(--violet)',
              marginBottom: 24,
            }} />
            <p style={{
              fontFamily: 'var(--font-editorial)',
              fontStyle: 'italic',
              fontSize: 15,
              color: 'var(--text-secondary)',
              lineHeight: 1.8,
              fontWeight: 300,
            }}>
              A prediction market intelligence system where transparency is the product.
            </p>
          </div>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(32px, 5vw, 56px)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '-0.01em',
              lineHeight: 0.95,
              color: 'var(--text-primary)',
              marginBottom: 40,
            }}>
              Most AI trading is a<br />
              <span style={{ color: 'var(--text-secondary)' }}>black box</span>{' '}
              <span className="editorial" style={{
                fontSize: 'clamp(28px, 4.5vw, 50px)',
                textTransform: 'none',
                color: 'var(--text-tertiary)',
              }}>you pay to follow.</span>
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
            }}>
              {[
                {
                  num: '01',
                  title: 'Edge identified',
                  body: 'The agent scans markets for mispricings — gaps between market-implied probability and its own multi-step assessment.',
                  color: 'var(--violet)',
                },
                {
                  num: '02',
                  title: 'Trace audit trail',
                  body: 'Every analysis is stored as a structured reasoning trace with verdict, evidence, dissent, risk notes, and exportable reports.',
                  color: 'var(--lime)',
                },
                {
                  num: '03',
                  title: 'You read the logic',
                  body: 'Thesis, evidence, risks, what would break the thesis. You see everything before deciding whether to follow or fade.',
                  color: 'var(--ice)',
                },
                {
                  num: '04',
                  title: 'Position stays auditable',
                  body: 'Every status change — watching, entry, exit — is tracked against the reasoning that justified it. No retroactive editing.',
                  color: 'var(--ember)',
                },
              ].map((item) => (
                <div key={item.num} className="card" style={{ padding: '22px 20px' }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: item.color,
                    marginBottom: 10,
                    letterSpacing: '0.08em',
                  }}>{item.num}</div>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--text-primary)',
                    marginBottom: 8,
                  }}>{item.title}</div>
                  <p style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7,
                    fontWeight: 300,
                  }}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <hr className="ruled" style={{ maxWidth: 1200, margin: '0 auto' }} />

      {/* ── FIELDS SHOWCASE ── */}
      <section style={{ padding: '100px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 60 }}>
          <div className="mono-label" style={{ marginBottom: 12 }}>002 — What you see in every trace</div>
          <h2 className="display-md" style={{ color: 'var(--text-primary)' }}>
            Not black-box scores.<br />
            <span style={{ color: 'var(--text-secondary)' }}>Actual reasoning.</span>
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {[
            {
              field: 'Edge',
              color: 'var(--lime)',
              example: 'Market is underpricing post-halving supply contraction against accelerating ETF inflow velocity',
              desc: 'One line. Plain English. The specific mispricing the agent is exploiting.',
            },
            {
              field: 'Positioning state',
              color: 'var(--violet)',
              example: 'ACCUMULATION BIAS - supportive liquidity, unresolved risk drag, catalyst path still active',
              desc: 'Institutional bands replace raw percentages and false precision.',
            },
            {
              field: 'Reasoning chain',
              color: 'var(--ice)',
              example: 'Macro -> Sentiment -> Technical -> Risk -> Catalyst -> Committee',
              desc: 'Structured multi-agent reasoning. Every agent output remains a separate specialist step.',
            },
            {
              field: 'What would break this',
              color: 'var(--ember)',
              example: 'BTC closes below $102k · ETF outflows for 3 consecutive days · Fed surprise',
              desc: 'Required. The agent must state its own invalidation criteria before entering.',
            },
          ].map((row) => (
            <div key={row.field} style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr 1fr',
              gap: 0,
              background: 'var(--bg-card)',
              padding: '24px 28px',
              alignItems: 'start',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: row.color,
                paddingTop: 2,
              }}>{row.field}</div>
              <div style={{
                fontSize: 13,
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                fontStyle: 'italic',
                fontFamily: 'var(--font-editorial)',
                paddingRight: 32,
              }}>{row.example}</div>
              <div style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
                lineHeight: 1.6,
                fontWeight: 300,
              }}>{row.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <hr className="ruled" style={{ maxWidth: 1200, margin: '0 auto' }} />

      {/* ── CTA ── */}
      <section style={{
        padding: '120px 32px 140px',
        textAlign: 'center',
        position: 'relative',
      }}>
        <div className="mono-label" style={{ marginBottom: 24 }}>003 — Start here</div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(48px, 8vw, 100px)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          lineHeight: 0.92,
          color: 'var(--text-primary)',
          marginBottom: 16,
        }}>
          Read the reasoning.<br />
          <span style={{ color: 'var(--violet)' }}>Place your bet.</span>
        </h2>
        <p className="editorial" style={{
          fontSize: 18,
          color: 'var(--text-secondary)',
          marginBottom: 48,
          fontWeight: 300,
        }}>
          Every position is an open book. Every premium unlock carries a USDC receipt.
        </p>
        <Link href="/dashboard" className="btn-primary" style={{ fontSize: 13, padding: '15px 36px' }}>
          Go to dashboard →
        </Link>
      </section>

      {/* FOOTER */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '24px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        maxWidth: 1200,
        margin: '0 auto',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          letterSpacing: '0.14em',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
        }}>Vestige</span>
        <span className="mono-label">Arc Testnet · Chain ID 5042002 · USDC-native settlement</span>
        <span className="mono-label">Built for Agora Agents Hackathon</span>
      </footer>
    </main>
  )
}
