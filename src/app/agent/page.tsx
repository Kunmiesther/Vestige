'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { listAgents, ApiError } from '@/lib/api'
import { formatDate, formatRelative } from '@/lib/trace-utils'
import { ARC_TESTNET } from '@/lib/arc'
import type { Agent } from '@/backend/shared/types/agent'

function StatusDot({ status }: { status: Agent['status'] }) {
  const colors = { active: 'var(--lime)', paused: 'var(--amber, #f5a623)', archived: 'var(--text-tertiary)' }
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: colors[status],
      boxShadow: status === 'active' ? `0 0 8px ${colors.active}` : 'none',
    }} />
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1,2].map(i => (
        <div key={i} className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[40, 60, 80].map((w, j) => (
              <div key={j} style={{ height: j === 0 ? 20 : 13, width: `${w}%`, background: 'var(--border)', borderRadius: 4, animation: 'shimmer 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      ))}
      <style>{`@keyframes shimmer{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>
    </div>
  )
}

export default function AgentPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true); setError(null)
    try { setAgents(await listAgents()) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to load agents.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return (
    <main style={{ padding: '48px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid var(--border)' }}>
        <div className="mono-label" style={{ marginBottom: 14 }}>Reasoning engine</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,52px)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
            lineHeight: 0.95, color: 'var(--text-primary)',
          }}>
            Agent<br /><span style={{ color: 'var(--violet)' }}>Registry</span>
          </h1>
          <Link href="/dashboard" className="btn-primary">+ Run analysis</Link>
        </div>
      </div>

      {/* Network info */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))',
        gap: 1, background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 32,
      }}>
        {[
          { label: 'Network', val: 'Arc Testnet', color: 'var(--text-primary)' },
          { label: 'Chain ID', val: String(ARC_TESTNET.chainId), color: 'var(--violet)' },
          { label: 'Gas token', val: 'USDC', color: 'var(--lime)' },
          { label: 'Finality', val: 'Sub-second', color: 'var(--ice)' },
          { label: 'Model', val: 'deepseek-r1', color: 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', padding: '16px 20px' }}>
            <div className="mono-label" style={{ marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: s.color }}>
              {s.val}
            </div>
          </div>
        ))}
      </div>

      {loading && <Skeleton />}

      {error && (
        <div style={{ border: '1px solid rgba(255,107,53,0.25)', background: 'rgba(255,107,53,0.04)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 300 }}>{error}</p>
          <button onClick={fetch} className="btn-ghost" style={{ marginTop: 12 }}>Retry</button>
        </div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '60px 32px', textAlign: 'center' }}>
          <div className="mono-label" style={{ color: 'var(--text-tertiary)' }}>No agents registered yet.</div>
        </div>
      )}

      {!loading && !error && agents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {agents.map(agent => (
            <div key={agent.id} className="card" style={{ padding: '24px 26px' }}>
              {/* Agent header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <StatusDot status={agent.status} />
                    <h2 style={{
                      fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)',
                    }}>{agent.name}</h2>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: agent.status === 'active' ? 'var(--lime)' : 'var(--text-tertiary)',
                      background: agent.status === 'active' ? 'var(--lime-dim)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${agent.status === 'active' ? 'var(--lime-border)' : 'var(--border)'}`,
                      padding: '2px 8px', borderRadius: 3,
                    }}>{agent.status}</span>
                  </div>
                  {agent.description && (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, fontWeight: 300, maxWidth: 560 }}>
                      {agent.description}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setExpanded(expanded === agent.id ? null : agent.id)} className="btn-ghost">
                    {expanded === agent.id ? 'Hide prompt' : 'View prompt'}
                  </button>
                  <Link href="/dashboard" className="btn-trace">Run →</Link>
                </div>
              </div>

              {/* Meta row */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: expanded === agent.id ? 16 : 0 }}>
                {[
                  { k: 'Model', v: agent.model },
                  { k: 'Slug', v: agent.slug },
                  { k: 'Created', v: formatRelative(agent.createdAt) },
                  { k: 'Updated', v: formatDate(agent.updatedAt) },
                ].map(({ k, v }) => (
                  <div key={k}>
                    <span className="mono-label" style={{ display: 'inline', marginRight: 5 }}>{k}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* System prompt expandable */}
              {expanded === agent.id && (
                <div style={{
                  background: 'rgba(5,5,7,0.8)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '16px 18px', marginTop: 4,
                }}>
                  <div className="mono-label" style={{ marginBottom: 8 }}>System prompt</div>
                  <pre style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                    lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                  }}>{agent.systemPrompt}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Architecture note */}
      <div style={{
        marginTop: 48, padding: '24px 28px',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        background: 'rgba(10,10,18,0.6)',
      }}>
        <div className="mono-label" style={{ marginBottom: 12 }}>Architecture</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 20 }}>
          {[
            { role: 'Researcher', color: 'var(--violet)', desc: 'Observes market conditions, gathers evidence, identifies signals' },
            { role: 'Risk Manager', color: 'var(--ember)', desc: 'Challenges the thesis, quantifies downside, sets stop conditions' },
            { role: 'Portfolio Manager', color: 'var(--lime)', desc: 'Synthesizes reasoning, sets position intent, publishes trace' },
          ].map(r => (
            <div key={r.role}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: r.color, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{r.role}</div>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6, fontWeight: 300 }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
