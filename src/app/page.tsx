import Link from 'next/link'

export default function HomePage() {
  return (
    <main>

      {/* ── HERO ── */}
      <section className="home-hero" style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px 32px 60px',
        maxWidth: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Hero background image */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/images/hero-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          backgroundRepeat: 'no-repeat',
          zIndex: 0,
        }} />
        {/* Dark overlay — keeps text readable */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, rgba(5,5,7,0.92) 0%, rgba(5,5,7,0.75) 50%, rgba(5,5,7,0.55) 100%)',
          zIndex: 1,
        }} />
        {/* Bottom fade into next section */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 200,
          background: 'linear-gradient(to bottom, transparent, #050507)',
          zIndex: 2,
        }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 3, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          {/* Ticker tape top */}
          <div className="home-ticker" style={{
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
              { label: 'Access', val: 'USDC gated' },
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
          <div className="home-headline" style={{ marginBottom: 40, overflow: 'hidden' }}>
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
          <div className="home-hero-actions" style={{
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
                Vestige turns agent committee research into paid onchain intelligence.
                Analysis creates the trace; USDC settlement unlocks the reasoning, dissent, and export package.
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
          <div className="home-stats-strip" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background: 'rgba(5,5,10,0.75)',
            backdropFilter: 'blur(16px)',
          }}>
            {[
              { label: 'Trace access', val: 'Paid', color: 'var(--text-primary)' },
              { label: 'Premium traces', val: 'USDC gated', color: 'var(--violet)' },
              { label: 'Agent committee', val: 'Specialized', color: 'var(--lime)' },
              { label: 'Receipts', val: 'Settled', color: 'var(--text-primary)' },
            ].map((s, i) => (
              <div key={s.label} style={{
                padding: '24px 28px',
                borderRight: i < 3 ? '1px solid var(--border)' : 'none',
              }}>
                <div className="mono-label" style={{ marginBottom: 10 }}>{s.label}</div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(20px, 2.5vw, 32px)',
                  fontWeight: 700,
                  color: s.color,
                  letterSpacing: '-0.01em',
                  lineHeight: 1,
                }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <hr className="ruled" style={{ maxWidth: 1200, margin: '0 auto' }} />

      {/* ── WHAT IT IS ── with trader image */}
      <section className="home-trader-section" style={{
        padding: '100px 32px',
        maxWidth: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Trader background — right side only */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/images/trader-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center right',
          backgroundRepeat: 'no-repeat',
          zIndex: 0,
        }} />
        {/* Heavy left overlay so text is fully readable */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, rgba(5,5,7,0.97) 0%, rgba(5,5,7,0.88) 55%, rgba(5,5,7,0.6) 80%, rgba(5,5,7,0.4) 100%)',
          zIndex: 1,
        }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto' }}>
          <div className="home-trader-grid" style={{
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
                A monetized onchain intelligence market where agent committee work is priced, settled, and audited in USDC.
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
                Most market commentary is a<br />
                <span style={{ color: 'var(--text-secondary)' }}>free feed</span>{' '}
                <span className="editorial" style={{
                  fontSize: 'clamp(28px, 4.5vw, 50px)',
                  textTransform: 'none',
                  color: 'var(--text-tertiary)',
                }}>you pay to follow.</span>
              </h2>
              <div className="home-feature-grid" style={{
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
                    title: 'Paid trace market',
                    body: 'Every analysis creates a locked intelligence asset. Access requires USDC settlement before reasoning, dissent, and exports are revealed.',
                    color: 'var(--lime)',
                  },
                  {
                    num: '03',
                    title: 'Unlock the logic',
                    body: 'Thesis, evidence, risks, and invalidation stay sealed until the Circle USDC receipt is verified.',
                    color: 'var(--ice)',
                  },
                  {
                    num: '04',
                    title: 'Receipt-backed audit',
                    body: 'Trace demand, paid unlocks, creator wallet, and settlement metadata make intelligence consumption economically visible.',
                    color: 'var(--ember)',
                  },
                ].map((item) => (
                  <div key={item.num} className="card" style={{
                    padding: '22px 20px',
                    background: 'rgba(10,10,18,0.85)',
                    backdropFilter: 'blur(8px)',
                  }}>
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
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <hr className="ruled" style={{ maxWidth: 1200, margin: '0 auto' }} />

      {/* ── FIELDS SHOWCASE ── */}
      <section className="home-fields-section" style={{ padding: '100px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div className="home-section-heading" style={{ marginBottom: 60 }}>
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
              example: 'Momentum Favors Continuation - supportive liquidity, unresolved risk drag, catalyst path still active',
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
            <div key={row.field} className="home-field-row" style={{
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

      {/* ── CTA ── with nodes image */}
      <section className="home-cta-section" style={{
        padding: '120px 32px 140px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Nodes background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/images/nodes-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: 0,
        }} />
        {/* Dark overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(5,5,7,0.82)',
          zIndex: 1,
        }} />
        {/* Top + bottom fades */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 120,
          background: 'linear-gradient(to bottom, #050507, transparent)',
          zIndex: 2,
        }} />
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 120,
          background: 'linear-gradient(to top, #050507, transparent)',
          zIndex: 2,
        }} />

        <div style={{ position: 'relative', zIndex: 3 }}>
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
        </div>
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

      {/* Mobile overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* Hero: gradient covers more on mobile */
          .hero-overlay {
            background: linear-gradient(to right, rgba(5,5,7,0.96) 0%, rgba(5,5,7,0.92) 100%) !important;
          }
          /* Trader section: full overlay on mobile */
          .trader-overlay {
            background: rgba(5,5,7,0.92) !important;
          }
          /* Stats strip → 2 col */
          .stats-strip {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>
    </main>
  )
}
