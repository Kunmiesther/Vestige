'use client'

export default function CircleCallbackPage() {
  return (
    <main style={{
      padding: '80px 32px 100px',
      maxWidth: 760,
      margin: '0 auto',
      minHeight: '50vh',
      display: 'flex',
      alignItems: 'center',
    }}>
      <div className="card" style={{ padding: '28px 30px', width: '100%' }}>
        <div className="mono-label" style={{ marginBottom: 10 }}>Circle authentication</div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-primary)',
          marginBottom: 12,
        }}>
          Completing login
        </h1>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.8,
        }}>
          Restoring the Circle wallet session and Arc Testnet wallet state.
        </p>
      </div>
    </main>
  )
}
