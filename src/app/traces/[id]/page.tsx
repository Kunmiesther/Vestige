'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getPremiumTrace, publishTrace, ApiError } from '@/lib/api'
import { getAddress, sendArcUsdcTransfer, sendX402PaymentTransaction, signMessage } from '@/lib/wallet'
import { useWallet } from '@/contexts/WalletContext'
import {
  formatDate,
  formatRelative,
  sideLabel,
  sideColor,
  truncateHash,
  traceAccessLabel,
  traceUnlockPrice,
  traceUnlockCount,
  deriveAuditMetrics,
  metricLabel,
  convictionState,
} from '@/lib/trace-utils'
import { ARC_PUBLISH_FEE_USDC, ARC_PUBLISH_PAY_TO, ARC_TESTNET, arcTxUrl } from '@/lib/arc'
import type { ReasoningTrace, TraceStatus, ReasoningStep, TracePaymentReceipt, TracePublicationReceipt } from '@/backend/shared/types/trace'
import type { PaymentChallenge, PremiumTracePreview } from '@/backend/shared/types/api'

const TRACE_UNLOCK_CHALLENGE_TIMEOUT_MS = 30000
const TRACE_SETTLE_TIMEOUT_MS = 45000
const BALANCE_REFRESH_TIMEOUT_MS = 6000
const TRACE_PUBLISH_TIMEOUT_MS = 16000

type UnlockState =
  | 'idle'
  | 'awaiting_wallet_approval'
  | 'signing_payment_authorization'
  | 'settling_payment'
  | 'confirming_payment'
  | 'payment_confirmed'
  | 'trace_unlocked'
  | 'unlock_failed'

type PublishState =
  | 'idle'
  | 'awaiting_signature'
  | 'publishing'
  | 'published'
  | 'failed'

function StatusBadge({ status }: { status: TraceStatus }) {
  const map: Record<TraceStatus, { cls: string; label: string }> = {
    draft: { cls: 'status-watching', label: 'Draft' },
    stored: { cls: 'status-watching', label: 'Stored' },
    failed: { cls: 'status-exited', label: 'Failed' },
  }
  const { cls, label } = map[status]
  return <span className={`status-badge ${cls}`}>{label}</span>
}

function LocalAuditBadge() {
  return (
    <span className="audit-badge">
      Persistent audit trail
    </span>
  )
}

function AccessBadge({ label }: { label: string }) {
  const premium = label !== 'PUBLIC'
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: premium ? 'var(--lime)' : 'var(--text-secondary)',
      background: premium ? 'var(--lime-dim)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${premium ? 'var(--lime-border)' : 'var(--border)'}`,
      padding: '3px 10px', borderRadius: 3,
    }}>{label}</span>
  )
}

function Block({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="card" style={{
      padding: '20px 22px',
      ...(accent ? { borderColor: accent, borderLeftWidth: 2 } : {}),
    }}>
      <div className="mono-label" style={{ marginBottom: 12 }}>{label}</div>
      {children}
    </div>
  )
}

function StepRoleColor(step: ReasoningStep, total: number): string {
  const title = step.title.toLowerCase()
  if (title.includes('macro')) return 'var(--ice)'
  if (title.includes('sentiment')) return 'var(--violet)'
  if (title.includes('technical')) return 'var(--lime)'
  if (title.includes('risk')) return 'var(--ember)'
  if (title.includes('catalyst')) return 'var(--violet)'
  if (title.includes('committee') || title.includes('synthesis')) return 'var(--lime)'
  if (step.order === 0) return 'var(--violet)'
  if (step.order === total - 1) return 'var(--lime)'
  return 'var(--ember)'
}

function StepRoleLabel(step: ReasoningStep, total: number): string {
  const title = step.title.toLowerCase()
  if (title.includes('macro')) return 'Macro'
  if (title.includes('sentiment')) return 'Sentiment'
  if (title.includes('technical')) return 'Technical'
  if (title.includes('risk')) return 'Risk'
  if (title.includes('catalyst')) return 'Catalyst'
  if (title.includes('committee') || title.includes('synthesis')) return 'Committee'
  if (step.order === 0) return 'Researcher'
  if (step.order === total - 1) return 'Portfolio Manager'
  return 'Risk Manager'
}

function Skeleton() {
  return (
    <main style={{ padding: '40px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[{ w: '100%', h: 14 }, { w: '60%', h: 40 }, { w: '80%', h: 14 }, { w: '40%', h: 14 }].map((d, i) => (
          <div key={i} style={{ height: d.h, width: d.w, background: 'var(--border)', borderRadius: 6, animation: 'shimmer 1.5s ease-in-out infinite' }} />
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, marginTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[120, 200, 280, 200].map((h, i) => (
              <div key={i} style={{ height: h, background: 'var(--border)', borderRadius: 10, animation: 'shimmer 1.5s ease-in-out infinite' }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[120, 180, 160].map((h, i) => (
              <div key={i} style={{ height: h, background: 'var(--border)', borderRadius: 10, animation: 'shimmer 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes shimmer{0%,100%{opacity:.3}50%{opacity:.7}}`}</style>
    </main>
  )
}

export default function TraceDetailPage() {
  const params = useParams()
  const traceId = typeof params.id === 'string' ? params.id : ''
  const wallet = useWallet()

  const [trace, setTrace] = useState<ReasoningTrace | null>(null)
  const [paymentRequired, setPaymentRequired] = useState<PaymentChallenge | null>(null)
  const [tracePreview, setTracePreview] = useState<PremiumTracePreview | null>(null)
  const [paymentReceipt, setPaymentReceipt] = useState<TracePaymentReceipt | undefined>(undefined)
  const [publicationReceipt, setPublicationReceipt] = useState<TracePublicationReceipt | undefined>(undefined)
  const [unlockState, setUnlockState] = useState<UnlockState>('idle')
  const [publishState, setPublishState] = useState<PublishState>('idle')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const unlockInFlightRef = useRef(false)
  const loadRequestRef = useRef(0)
  const unlockResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accessLoadKeyRef = useRef<string | null>(null)
  const unlocking = isUnlockInFlight(unlockState)
  const actionStatus = unlockStatusMessage(unlockState)
  const publishing = publishState === 'awaiting_signature' || publishState === 'publishing'

  useEffect(() => {
    if (!traceId) return
    if (unlockInFlightRef.current) return
    let cancelled = false
    const accessWalletAddress = wallet.activeAddress ?? wallet.address ?? undefined
    const accessLoadKey = `${traceId}:${accessWalletAddress ?? ''}`
    if (accessLoadKeyRef.current === accessLoadKey) return
    accessLoadKeyRef.current = accessLoadKey
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    setLoading(true); setError(null)
    if (!unlockInFlightRef.current) {
      clearUnlockResetTimer()
      setActionError(null)
      setUnlockState('idle')
    }
    getPremiumTrace(traceId, undefined, accessWalletAddress)
      .then(result => {
        if (cancelled || requestId !== loadRequestRef.current || unlockInFlightRef.current) return
        if (result.status === 'payment_required') {
          setPaymentRequired(result.paymentRequired)
          setTracePreview(result.tracePreview ?? null)
          setPaymentReceipt(undefined)
          setPublicationReceipt(undefined)
          setTrace(null)
          return
        }
        setTrace(result.trace)
        setPaymentReceipt(result.receipt)
        setPublicationReceipt(result.trace.publicationReceipts?.[0])
        setPaymentRequired(null)
        setTracePreview(null)
      })
      .catch(e => {
        if (!cancelled && requestId === loadRequestRef.current && !unlockInFlightRef.current) {
          setError(e instanceof ApiError && e.code === 'TRACE_NOT_FOUND'
            ? 'Trace is still being indexed. Reopen it in a moment.'
            : premiumTraceLoadErrorMessage(e))
        }
      })
      .finally(() => {
        if (!cancelled && requestId === loadRequestRef.current && !unlockInFlightRef.current) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [traceId, wallet.activeAddress, wallet.address])

  useEffect(() => {
    return () => clearUnlockResetTimer()
  }, [])

  function clearUnlockResetTimer() {
    if (!unlockResetTimerRef.current) return
    clearTimeout(unlockResetTimerRef.current)
    unlockResetTimerRef.current = null
  }

  function scheduleUnlockStateReset() {
    clearUnlockResetTimer()
    unlockResetTimerRef.current = setTimeout(() => {
      setUnlockState('idle')
      unlockResetTimerRef.current = null
    }, 2400)
  }

  function schedulePublishStateReset() {
    window.setTimeout(() => setPublishState('idle'), 2400)
  }

  async function unlockTrace() {
    if (unlockInFlightRef.current) return

    if (!wallet.isConnected) {
      setActionError('Connect an EVM wallet before unlocking paid intelligence.')
      setUnlockState('unlock_failed')
      return
    }

    if (!traceId || !paymentRequired) return

    unlockInFlightRef.current = true
    loadRequestRef.current += 1
    clearUnlockResetTimer()
    setActionError(null)
    setUnlockState('awaiting_wallet_approval')
    try {
      const paymentAccessWallet = wallet.activeWalletType === 'injected'
        ? wallet.activeAddress ?? wallet.address ?? undefined
        : wallet.walletType === 'injected'
          ? wallet.address ?? undefined
          : undefined
      const challengeResult = await withTimeout(
        getPremiumTrace(traceId, undefined, paymentAccessWallet),
        TRACE_UNLOCK_CHALLENGE_TIMEOUT_MS,
        'Trace unlock challenge timed out.',
      )
      if (challengeResult.status === 'granted') {
        setTrace({ ...challengeResult.trace, locked: false })
        setPaymentReceipt(challengeResult.receipt)
        setPublicationReceipt(challengeResult.trace.publicationReceipts?.[0])
        setPaymentRequired(null)
        setTracePreview(null)
        setUnlockState('trace_unlocked')
        scheduleUnlockStateReset()
        return
      }

      const activeChallenge = challengeResult.paymentRequired
      setPaymentRequired(activeChallenge)
      setTracePreview(challengeResult.tracePreview ?? tracePreview)
      setUnlockState('signing_payment_authorization')

      const paymentConnectorId = activeEvmConnectorId(wallet)
      const expectedPaymentAddress = wallet.activeWalletType === 'injected'
        ? wallet.activeAddress ?? wallet.address ?? undefined
        : undefined
      if (!paymentConnectorId) {
        throw new Error('Connect an EVM wallet before unlocking paid intelligence.')
      }
      const paymentWalletAddress = await getAddress(paymentConnectorId).catch(() => null)
      setUnlockState('settling_payment')
      const paymentTxHash = await sendX402PaymentTransaction(
        activeChallenge,
        expectedPaymentAddress,
        (progressState) => setUnlockState(progressState),
        paymentConnectorId,
      )
      const submittedPaymentWalletAddress = await getAddress(paymentConnectorId).catch(() => null)
      const verifiedWalletAddress = submittedPaymentWalletAddress ?? paymentWalletAddress ?? expectedPaymentAddress
      setPaymentReceipt({
        receiptId: paymentTxHash,
        protocol: 'x402',
        amount: activeChallenge.amount,
        asset: 'USDC',
        network: activeChallenge.network,
        payer: verifiedWalletAddress,
        payTo: activeChallenge.payTo,
        txHash: paymentTxHash,
        settlementStatus: 'submitted',
        unlockedAt: new Date().toISOString(),
      })
      const result = await withTimeout(
        getPremiumTrace(traceId, paymentTxHash, verifiedWalletAddress),
        TRACE_SETTLE_TIMEOUT_MS,
        'Trace settlement timed out.',
      )
      if (result.status === 'payment_required') {
        setPaymentRequired(result.paymentRequired)
        setTracePreview(result.tracePreview ?? tracePreview)
        setActionError('Payment was not accepted. Confirm wallet approval and try again.')
        setUnlockState('unlock_failed')
        return
      }

      if (!result.receipt) {
        throw new Error('Payment confirmation was not returned.')
      }

      setUnlockState('payment_confirmed')

      const unlockedTrace = result.trace
      const unlockedReceipt = { ...result.receipt, txHash: paymentTxHash }

      setTrace({ ...unlockedTrace, locked: false })
      setPaymentReceipt(unlockedReceipt)
      setPublicationReceipt(unlockedTrace.publicationReceipts?.[0] ?? publicationReceipt)
      setPaymentRequired(null)
      setTracePreview(null)
      setError(null)
      setLoading(false)
      setUnlockState('trace_unlocked')
      scheduleUnlockStateReset()
      void withTimeout(wallet.refreshBalance(), BALANCE_REFRESH_TIMEOUT_MS, 'Balance refresh timed out.').catch(() => undefined)
    } catch (e) {
      setActionError(paymentErrorMessage(e))
      setUnlockState('unlock_failed')
      scheduleUnlockStateReset()
    } finally {
      unlockInFlightRef.current = false
    }
  }

  async function publishCurrentTrace() {
    if (publishing) return
    if (!trace || trace.locked) {
      setActionError('Unlock trace to publish it.')
      setPublishState('failed')
      return
    }
    if (!wallet.isConnected) {
      setActionError('Connect an EVM wallet before publishing.')
      setPublishState('failed')
      return
    }

    const activeConnectorId = activeEvmConnectorId(wallet)
    if (!activeConnectorId) {
      setActionError('Connect an EVM wallet before publishing.')
      setPublishState('failed')
      return
    }
    const activeAddress = await getAddress(activeConnectorId).catch(() => wallet.activeAddress ?? wallet.address)
    if (!activeAddress) {
      setActionError('Connect an EVM wallet before publishing.')
      setPublishState('failed')
      return
    }

    setActionError(null)
    setPublishState('awaiting_signature')
    try {
      const contentDigest = await digestTrace(trace)
      const message = [
        'Vestige trace publication authorization',
        `traceId=${trace.id}`,
        `contentDigest=${contentDigest}`,
        `publisher=${activeAddress}`,
        `network=eip155:${ARC_TESTNET.chainId}`,
        `publishPayTo=${ARC_PUBLISH_PAY_TO}`,
        `publishAmount=${ARC_PUBLISH_FEE_USDC} USDC`,
      ].join('\n')
      const signature = await signMessage(message, activeAddress, activeConnectorId)
      setPublishState('publishing')
      const publicationTxHash = await sendArcUsdcTransfer({
        to: ARC_PUBLISH_PAY_TO,
        amount: ARC_PUBLISH_FEE_USDC,
        expectedWalletAddress: activeAddress,
        connectorId: activeConnectorId,
      })
      const result = await withTimeout(
        publishTrace(trace.id, {
          publisher: activeAddress,
          signature,
          message,
          contentDigest,
          publicationTxHash,
          unlockReceiptId: paymentReceipt?.receiptId ?? receipts[0]?.receiptId,
        }),
        TRACE_PUBLISH_TIMEOUT_MS,
        'Trace publication timed out.',
      )
      setTrace({ ...result.trace, locked: false })
      setPublicationReceipt({
        ...result.receipt,
        txHash: publicationTxHash,
        amount: result.receipt.amount ?? ARC_PUBLISH_FEE_USDC,
        asset: result.receipt.asset ?? 'USDC',
        payTo: result.receipt.payTo ?? ARC_PUBLISH_PAY_TO,
        settlementStatus: result.receipt.settlementStatus ?? 'confirmed',
      })
      setPublishState('published')
      schedulePublishStateReset()
      void withTimeout(wallet.refreshBalance(), BALANCE_REFRESH_TIMEOUT_MS, 'Balance refresh timed out.').catch(() => undefined)
    } catch (e) {
      setActionError(publishErrorMessage(e))
      setPublishState('failed')
      schedulePublishStateReset()
    }
  }

  async function copyText(text: string, label: string) {
    setActionError(null)
    try {
      await navigator.clipboard.writeText(text)
      setActionError(null)
    } catch {
      setActionError('Clipboard copy failed.')
    }
  }

  function download(filename: string, body: string, type: string) {
    const blob = new Blob([body], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setActionError(null)
  }

  if (loading) return <Skeleton />

  const previewPaymentReceipt = tracePreview?.lastPaymentReceipt
  const previewPublicationReceipt = tracePreview?.lastPublicationReceipt

  if (paymentRequired && !trace) return (
    <main style={{ padding: '48px 32px 100px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36,
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        <Link href="/traces" style={{ color: 'var(--text-tertiary)', transition: 'color .15s' }}>Traces</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{tracePreview?.assetSymbol ?? 'Premium'}</span>
        <span>/</span>
        <span>{truncateHash(traceId, 18)}</span>
      </div>

      <div className="card" style={{ padding: '28px 30px', borderColor: 'var(--lime-border)', background: 'rgba(10,10,20,0.92)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <AccessBadge label={(tracePreview?.accessTier ?? 'premium').toUpperCase()} />
          <span className="audit-badge">USDC gated trace</span>
          {tracePreview?.unlockCount !== undefined && (
            <span className="mono-label" style={{ marginBottom: 0, color: 'var(--text-tertiary)' }}>
              {tracePreview.unlockCount} paid unlock{tracePreview.unlockCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(24px,4vw,42px)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
          lineHeight: 1.05, color: 'var(--text-primary)', marginBottom: 14,
        }}>{tracePreview?.market ?? 'Premium reasoning trace'}</h1>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, fontWeight: 300, marginBottom: 24 }}>
          Institutional intelligence requires unlock. Running analysis creates the trace; every read requires a settled USDC receipt, including the creator wallet.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 22 }}>
          {[
            { k: 'Price', v: `${paymentRequired.amount} ${paymentRequired.asset}` },
            { k: 'Settlement', v: paymentRailLabel(paymentRequired) },
            { k: 'Status', v: paywallStatusLabel(unlockState) },
            { k: 'Created', v: tracePreview?.createdAt ? formatDate(tracePreview.createdAt) : 'No data yet' },
            { k: 'Unlocks', v: String(tracePreview?.unlockCount ?? 0) },
            { k: 'USDC generated', v: tracePreview?.totalUsdcGenerated ?? '0.00' },
            { k: 'Publications', v: String(tracePreview?.publicationCount ?? 0) },
          ].map(item => (
            <div key={item.k} style={{ background: 'var(--bg-card)', padding: '14px 16px' }}>
              <div className="mono-label" style={{ marginBottom: 5 }}>{item.k}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: item.k === 'Price' ? 'var(--lime)' : 'var(--text-primary)' }}>{item.v}</div>
            </div>
          ))}
        </div>

        {tracePreview?.creatorWalletAddress && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
            marginBottom: 18, wordBreak: 'break-all', lineHeight: 1.7,
          }}>
            Creator wallet {tracePreview.creatorWalletAddress}
          </div>
        )}

        {(previewPaymentReceipt || previewPublicationReceipt) && (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'rgba(255,255,255,0.025)',
            padding: '14px 16px',
            marginBottom: 22,
          }}>
            <div className="mono-label" style={{ marginBottom: 10 }}>Transaction visibility</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
              {previewPaymentReceipt && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 12px', minWidth: 0 }}>
                  <div className="mono-label" style={{ marginBottom: 7 }}>Latest unlock</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--lime)', marginBottom: 5 }}>
                    {previewPaymentReceipt.amount} {previewPaymentReceipt.asset}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {formatDate(previewPaymentReceipt.unlockedAt)}
                  </div>
                  {previewPaymentReceipt.txHash && (
                    <a href={arcTxUrl(previewPaymentReceipt.txHash)} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ marginTop: 10, fontSize: 10, padding: '6px 10px' }}>
                      View unlock tx
                    </a>
                  )}
                </div>
              )}
              {previewPublicationReceipt && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 12px', minWidth: 0 }}>
                  <div className="mono-label" style={{ marginBottom: 7 }}>Latest publication</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--lime)', marginBottom: 5 }}>
                    {previewPublicationReceipt.amount ?? ARC_PUBLISH_FEE_USDC} {previewPublicationReceipt.asset ?? 'USDC'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {formatDate(previewPublicationReceipt.publishedAt)}
                  </div>
                  {previewPublicationReceipt.txHash && (
                    <a href={arcTxUrl(previewPublicationReceipt.txHash)} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ marginTop: 10, fontSize: 10, padding: '6px 10px' }}>
                      View publish tx
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card" style={{
          padding: '16px 18px',
          borderColor: 'rgba(179,136,255,0.18)',
          background: 'rgba(5,5,7,0.58)',
          marginBottom: 22,
        }}>
          <div className="mono-label" style={{ marginBottom: 10 }}>Locked preview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }} className="locked-preview-grid">
            {[
              { k: 'Alignment', v: 'Sealed' },
              { k: 'Pressure', v: 'Sealed' },
              { k: 'Volatility', v: 'Sealed' },
              { k: 'Catalyst', v: 'Sealed' },
            ].map(item => (
              <div key={item.k} style={{
                minHeight: 68,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 12px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
              }}>
                <div className="mono-label" style={{ marginBottom: 8 }}>{item.k}</div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-tertiary)',
                  textTransform: 'uppercase', filter: 'blur(2px)', opacity: 0.5,
                }}>{item.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10,
          marginBottom: 22,
        }}>
          {['Committee debate', 'Positioning state', 'Export package'].map(label => (
            <div key={label} style={{
              minHeight: 96,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'linear-gradient(135deg, rgba(179,136,255,0.08), rgba(204,255,0,0.03))',
              padding: '14px 16px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div className="mono-label" style={{ marginBottom: 10 }}>{label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, filter: 'blur(3px)', opacity: 0.5 }}>
                <span style={{ height: 8, width: '90%', background: 'var(--border-hover)', borderRadius: 2 }} />
                <span style={{ height: 8, width: '70%', background: 'var(--border-hover)', borderRadius: 2 }} />
                <span style={{ height: 8, width: '82%', background: 'var(--border-hover)', borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'rgba(255,255,255,0.025)',
            padding: '14px 16px',
          }}>
            <div className="mono-label" style={{ marginBottom: 8 }}>USDC wallet checkout</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, fontWeight: 300, marginBottom: 0 }}>
              Approve the USDC unlock in your connected wallet. Vestige settles the receipt in the background and opens reasoning, agent outputs, and exports after confirmation.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={unlockTrace}
              disabled={unlocking}
              className="btn-primary"
              style={{
                opacity: unlocking ? 0.7 : 1,
                cursor: unlocking ? 'not-allowed' : 'pointer',
              }}
            >
              {unlocking
                ? actionStatus
                : wallet.isConnected
                  ? `Unlock Trace - ${paymentRequired.amount} ${paymentRequired.asset}`
                  : 'Connect EVM Wallet to Unlock'}
            </button>
          </div>

          {actionError && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
              background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.22)',
              borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
            }}>{actionError}</div>
          )}

          {actionStatus && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)',
              background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
              borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
            }}>{actionStatus}</div>
          )}

        </div>
      </div>
    </main>
  )

  if (error || !trace) return (
    <main style={{ padding: '80px 32px', maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
      <div className="mono-label" style={{ color: 'var(--ember)', marginBottom: 12 }}>Error</div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, fontWeight: 300 }}>{error ?? 'Trace not found.'}</p>
      <Link href="/traces" className="btn-ghost">Back to traces</Link>
    </main>
  )

  const steps = [...trace.reasoningSteps].sort((a, b) => a.order - b.order)
  const total = steps.length
  const markdown = trace.locked ? '' : traceToMarkdown(trace, steps)
  const json = trace.locked ? '' : JSON.stringify(trace, null, 2)
  const summary = trace.locked ? '' : traceToSummary(trace)
  const auditMetrics = deriveAuditMetrics(trace)
  const receipts = uniqueReceipts([...(trace.paymentReceipts ?? []), ...(paymentReceipt ? [paymentReceipt] : [])])
  const unlockCount = Math.max(traceUnlockCount(trace), receipts.length)
  const publications = uniquePublicationReceipts([...(trace.publicationReceipts ?? []), ...(publicationReceipt ? [publicationReceipt] : [])])
  const publishStatus = publishStatusMessage(publishState)

  function gatedAction(action: () => void) {
    if (!trace || trace.locked) {
      setActionError('Unlock trace to export intelligence.')
      return
    }
    action()
  }

  return (
    <main style={{ padding: '40px 32px 100px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36,
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        <Link href="/traces" style={{ color: 'var(--text-tertiary)', transition: 'color .15s' }}>Traces</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{trace.assetSymbol}</span>
        <span>/</span>
        <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trace.id}</span>
      </div>

      <div style={{ marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--violet)', background: 'var(--violet-dim)',
            border: '1px solid var(--violet-border)', padding: '3px 10px', borderRadius: 3,
          }}>{trace.assetSymbol}</span>
          <AccessBadge label={traceAccessLabel(trace)} />
          <StatusBadge status={trace.status} />
          <LocalAuditBadge />
          {trace.locked ? <span className="audit-badge">Locked</span> : receipts.length > 0 && <span className="audit-badge">Paid access</span>}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
            marginLeft: 'auto', letterSpacing: '0.04em',
          }}>{formatRelative(trace.createdAt)}</span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(22px,3.5vw,40px)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.01em',
          lineHeight: 1.1, color: 'var(--text-primary)', marginBottom: 28,
        }}>{trace.market}</h1>

        <div style={{
          display: 'grid', gridTemplateColumns: '3px 1fr', gap: 16,
        }}>
          <div style={{ background: sideColor(trace.positionIntent.side), borderRadius: 2 }} />
          <div>
            <div className="mono-label" style={{ color: sideColor(trace.positionIntent.side), marginBottom: 10 }}>
              Position intent - {sideLabel(trace.positionIntent.side).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              {[
                trace.positionIntent.entry && { k: 'Entry', v: `$${trace.positionIntent.entry.toLocaleString()}`, color: 'var(--text-primary)' },
                trace.positionIntent.target && { k: 'Target', v: `$${trace.positionIntent.target.toLocaleString()}`, color: 'var(--lime)' },
                trace.positionIntent.stopLoss && { k: 'Stop', v: `$${trace.positionIntent.stopLoss.toLocaleString()}`, color: 'var(--ember)' },
                { k: 'Horizon', v: trace.positionIntent.timeHorizon, color: 'var(--text-secondary)' },
              ].filter(Boolean).map(item => item && (
                <div key={item.k}>
                  <span className="mono-label" style={{ marginRight: 6, display: 'inline' }}>{item.k}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: item.color }}>{item.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 300px',
        gap: 20, alignItems: 'start',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Block label="Thesis">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.9, fontWeight: 300 }}>
              {trace.thesis}
            </p>
          </Block>

          <div style={{ display: 'grid', gridTemplateColumns: '3px 1fr', gap: 14 }}>
            <div style={{ background: 'var(--lime)', borderRadius: 2 }} />
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="mono-label" style={{ color: 'var(--lime)', marginBottom: 8 }}>Edge</div>
              <p style={{
                fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
                fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 300,
              }}>
                {steps[0]?.inference ?? trace.thesis}
              </p>
            </div>
          </div>

          <div>
            <div className="mono-label" style={{ marginBottom: 12 }}>Reasoning chain</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map(step => (
                <div key={step.order} className="card" style={{
                  padding: '16px 18px',
                  borderLeft: `2px solid ${StepRoleColor(step, total)}`,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 10, flexWrap: 'wrap', gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'var(--text-tertiary)',
                      }}>Step {step.order + 1}</span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
                        textTransform: 'uppercase', fontWeight: 500,
                        color: StepRoleColor(step, total),
                      }}>{StepRoleLabel(step, total)}</span>
                      {step.title && (
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: 'var(--text-tertiary)', letterSpacing: '0.04em',
                        }}>- {step.title}</span>
                      )}
                    </div>
                  </div>

                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: step.inference ? 10 : 0,
                  }}>{step.observation}</p>

                  {step.inference && (
                    <p style={{
                      fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
                      fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, fontWeight: 300,
                      borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4,
                    }}>{step.inference}</p>
                  )}

                  {step.evidence && step.evidence.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {step.evidence.map((e, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--violet)', flexShrink: 0, marginTop: 3,
                          }}>-</span>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 11,
                            color: 'var(--text-tertiary)', lineHeight: 1.6,
                          }}>{e}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {trace.locked ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }} className="locked-trace-grid">
              {['Committee reasoning', 'Agent outputs', 'Catalysts', 'Verdict'].map(label => (
                <div key={label} className="card" style={{ padding: '18px 20px', minHeight: 120, background: 'rgba(255,255,255,0.02)', filter: 'blur(2px)', opacity: 0.55 }}>
                  <div className="mono-label" style={{ marginBottom: 8 }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                    Unlock trace to view the underlying intelligence.
                  </div>
                </div>
              ))}
            </div>
          ) : trace.catalysts.length > 0 && (
            <Block label="Catalysts">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trace.catalysts.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--lime)', flexShrink: 0, marginTop: 3 }}>+</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, fontWeight: 300 }}>{c}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {!trace.locked && trace.risks.length > 0 && (
            <Block label="Risks">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trace.risks.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ember)', flexShrink: 0, marginTop: 3 }}>!</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, fontWeight: 300 }}>{r}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          <div className="card" style={{
            padding: '20px 22px', borderColor: 'rgba(179,136,255,0.2)',
            background: 'rgba(10,10,20,0.9)',
          }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>Conclusion</div>
            <p style={{
              fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
              fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.8, fontWeight: 300,
            }}>
              {steps[total - 1]?.inference ?? `${sideLabel(trace.positionIntent.side)} positioning. ${convictionState(trace)}. ${trace.positionIntent.timeHorizon} horizon.`}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div className="mono-label" style={{ marginBottom: 14 }}>Audit lens</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { k: 'Positioning', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: sideColor(trace.positionIntent.side), textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sideLabel(trace.positionIntent.side)}</span> },
                { k: 'State', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{trace.verdict?.action ?? 'Regime Shift Watch'}</span> },
                { k: 'Regime', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{auditMetrics.marketRegime}</span> },
                { k: 'Liquidity', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{auditMetrics.liquidityState}</span> },
                { k: 'Volatility', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{auditMetrics.volatilityState}</span> },
                { k: 'Alignment', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{metricLabel(auditMetrics.alignment)}</span> },
                { k: 'Pressure', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{metricLabel(auditMetrics.pressure)}</span> },
                { k: 'Catalyst', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{metricLabel(auditMetrics.catalystStrength)}</span> },
                { k: 'Disagreement', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{metricLabel(auditMetrics.disagreement)}</span> },
                { k: 'Conviction', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{auditMetrics.convictionTemperature}</span> },
                { k: 'Demand', v: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{trace.demandScore ?? unlockCount}</span> },
              ].map(row => (
                <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="mono-label" style={{ marginBottom: 0, flexShrink: 0 }}>{row.k}</span>
                  {row.v}
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px' }}>
            <div className="mono-label" style={{ marginBottom: 12 }}>Timestamps</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div className="mono-label" style={{ marginBottom: 3 }}>Created</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  {formatDate(trace.createdAt)}
                </div>
              </div>
              <div>
                <div className="mono-label" style={{ marginBottom: 3 }}>Unlocks</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  {unlockCount} paid access event{unlockCount === 1 ? '' : 's'}
                </div>
              </div>
              <div>
                <div className="mono-label" style={{ marginBottom: 3 }}>Demand</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                  {trace.demandScore ?? unlockCount}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px', background: 'rgba(5,5,7,0.9)' }}>
            <div className="mono-label" style={{ marginBottom: 14 }}>Audit trail</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <LocalAuditBadge />
              <AccessBadge label={traceAccessLabel(trace)} />

              <div>
                <div className="mono-label" style={{ marginBottom: 4 }}>Trace ID</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                  {truncateHash(trace.id, 18)}
                </div>
              </div>

              {actionError && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)',
                  background: 'var(--ember-dim)', border: '1px solid rgba(255,107,53,0.22)',
                  borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
                }}>{actionError}</div>
              )}

              {actionStatus && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--violet)',
                  background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
                  borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
                }}>{actionStatus}</div>
              )}

              {publishStatus && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: publishState === 'failed' ? 'var(--ember)' : 'var(--violet)',
                  background: publishState === 'failed' ? 'var(--ember-dim)' : 'var(--violet-dim)',
                  border: `1px solid ${publishState === 'failed' ? 'rgba(255,107,53,0.22)' : 'var(--violet-border)'}`,
                  borderRadius: 'var(--radius)', padding: '10px 12px', lineHeight: 1.6,
                }}>{publishStatus}</div>
              )}

              <button onClick={() => gatedAction(() => copyText(summary, 'Summary'))} disabled={trace.locked} title={trace.locked ? 'Unlock trace to export intelligence' : undefined} className="btn-ghost" style={{ justifyContent: 'center', opacity: trace.locked ? 0.45 : 1 }}>
                Copy summary
              </button>
              <button onClick={() => gatedAction(() => copyText(markdown, 'Markdown'))} disabled={trace.locked} title={trace.locked ? 'Unlock trace to export intelligence' : undefined} className="btn-ghost" style={{ justifyContent: 'center', opacity: trace.locked ? 0.45 : 1 }}>
                Copy markdown
              </button>
              <button onClick={() => gatedAction(() => copyText(json, 'JSON'))} disabled={trace.locked} title={trace.locked ? 'Unlock trace to export intelligence' : undefined} className="btn-ghost" style={{ justifyContent: 'center', opacity: trace.locked ? 0.45 : 1 }}>
                Copy JSON
              </button>
              <button onClick={() => gatedAction(() => download(`${trace.assetSymbol}-${trace.id}.json`, json, 'application/json'))} disabled={trace.locked} title={trace.locked ? 'Unlock trace to export intelligence' : undefined} className="btn-ghost" style={{ justifyContent: 'center', opacity: trace.locked ? 0.45 : 1 }}>
                Export JSON
              </button>
              <button onClick={() => gatedAction(() => download(`${trace.assetSymbol}-${trace.id}.md`, markdown, 'text/markdown'))} disabled={trace.locked} title={trace.locked ? 'Unlock trace to export intelligence' : undefined} className="btn-primary" style={{ justifyContent: 'center', opacity: trace.locked ? 0.45 : 1 }}>
                Download report
              </button>
              <button
                onClick={() => gatedAction(() => void publishCurrentTrace())}
                disabled={trace.locked || publishing}
                title={trace.locked ? 'Unlock trace to publish intelligence' : undefined}
                className="btn-ghost"
                style={{ justifyContent: 'center', opacity: trace.locked || publishing ? 0.45 : 1 }}
              >
                {publishing ? publishStatus ?? 'Publishing...' : wallet.isConnected ? 'Publish to Arc' : 'Connect wallet to publish'}
              </button>
            </div>
          </div>

          {!trace.locked && trace.verdict && (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="mono-label" style={{ marginBottom: 14 }}>Verdict</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span className="mono-label">Positioning</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>
                    {trace.verdict.action}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {trace.verdict.summary}
                </p>
                {trace.verdict.primaryDrivers.length > 0 && (
                  <div>
                    <div className="mono-label" style={{ marginBottom: 6 }}>Primary drivers</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {trace.verdict.primaryDrivers.map((driver, index) => (
                        <div key={index} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {driver}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {trace.verdict.invalidation.length > 0 && (
                  <div>
                    <div className="mono-label" style={{ marginBottom: 6 }}>Invalidation</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {trace.verdict.invalidation.map((item, index) => (
                        <div key={index} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember)', lineHeight: 1.6 }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!trace.locked && receipts.length > 0 && (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="mono-label" style={{ marginBottom: 14 }}>Transaction receipt</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {receipts.map(receipt => (
                  <div key={receipt.receiptId} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Receipt</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, wordBreak: 'break-all' }}>
                      {receipt.receiptId}
                    </div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Amount</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--lime)' }}>{receipt.amount} {receipt.asset}</div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Payer</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      {receipt.payer ?? 'Unknown'}
                    </div>
                    {receipt.payTo && (
                      <>
                        <span className="mono-label" style={{ marginBottom: 0 }}>Pay to</span>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                          {receipt.payTo}
                        </div>
                      </>
                    )}
                    <span className="mono-label" style={{ marginBottom: 0 }}>Network</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{receipt.network}</div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Timestamp</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{formatDate(receipt.unlockedAt)}</div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Settlement</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: receipt.settlementStatus === 'confirmed' ? 'var(--lime)' : 'var(--violet)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {receipt.settlementStatus ?? 'confirmed'}
                    </div>
                    {receipt.txHash && (
                      <>
                        <span className="mono-label" style={{ marginBottom: 0 }}>Tx hash</span>
                        <div>
                          <a href={arcTxUrl(receipt.txHash)} target="_blank" rel="noopener noreferrer" title={receipt.txHash} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{truncateHash(receipt.txHash, 12)}</a>
                          <a href={arcTxUrl(receipt.txHash)} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ marginTop: 8, justifyContent: 'center', fontSize: 10, padding: '6px 10px' }}>View Transaction</a>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!trace.locked && publications.length > 0 && (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="mono-label" style={{ marginBottom: 14 }}>Arc publication</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {publications.map(receipt => (
                  <div key={receipt.publicationId} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Publication</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, wordBreak: 'break-all' }}>
                      {receipt.publicationId}
                    </div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Publisher</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{receipt.publisher}</div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Amount</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--lime)' }}>{receipt.amount ?? ARC_PUBLISH_FEE_USDC} {receipt.asset ?? 'USDC'}</div>
                    {receipt.payTo && (
                      <>
                        <span className="mono-label" style={{ marginBottom: 0 }}>Pay to</span>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{receipt.payTo}</div>
                      </>
                    )}
                    <span className="mono-label" style={{ marginBottom: 0 }}>Network</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{receipt.network}</div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Settlement</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: receipt.settlementStatus === 'failed' ? 'var(--ember)' : 'var(--lime)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {receipt.settlementStatus ?? 'confirmed'}
                    </div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Storage</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--lime)', textTransform: 'uppercase' }}>{receipt.storage}</div>
                    <span className="mono-label" style={{ marginBottom: 0 }}>Timestamp</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{formatDate(receipt.publishedAt)}</div>
                    {receipt.txHash && (
                      <>
                        <span className="mono-label" style={{ marginBottom: 0 }}>Tx hash</span>
                        <div>
                          <a href={arcTxUrl(receipt.txHash)} target="_blank" rel="noopener noreferrer" title={receipt.txHash} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{truncateHash(receipt.txHash, 12)}</a>
                          <a href={arcTxUrl(receipt.txHash)} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ marginTop: 8, justifyContent: 'center', fontSize: 10, padding: '6px 10px' }}>View Transaction</a>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link href="/traces" className="btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
            All traces
          </Link>
          <Link href="/markets" className="btn-ghost" style={{ justifyContent: 'center', width: '100%' }}>
            View in markets
          </Link>
        </div>
      </div>

      <style>{`
        @media(max-width:768px){
          main > div:last-of-type { grid-template-columns: 1fr !important; }
          .locked-trace-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}

function paymentErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const normalized = message.toLowerCase()

  if (normalized.includes('timed out') || normalized.includes('timeout')) {
    return 'Payment confirmation timed out. Try again.'
  }
  if (normalized.includes('user canceled') || normalized.includes('cancel')) {
    return 'Wallet approval was cancelled.'
  }
  if (normalized.includes('not enough') || normalized.includes('balance')) {
    return 'Wallet does not have enough USDC to unlock this trace.'
  }
  if (normalized.includes('facilitator') || normalized.includes('settlement') || normalized.includes('verification')) {
    return 'Payment settlement failed. Try again after confirming wallet funding and network availability.'
  }
  if (normalized.includes('authorization') || normalized.includes('signed wallet approval')) {
    return 'Wallet approval could not be completed. Try again.'
  }
  if (normalized.includes('undeployed wallet')) return 'Switch to a self-custody EVM wallet and try again.'
  if (normalized.includes('circle') || normalized.includes('wallet')) {
    return message
  }

  return 'Unlock failed. Try again after confirming the wallet approval.'
}

function publishErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const normalized = message.toLowerCase()
  if (normalized.includes('timed out') || normalized.includes('timeout')) return 'Trace publication timed out. Try again.'
  if (normalized.includes('cancel') || normalized.includes('rejected') || normalized.includes('denied')) return 'Wallet publication signature was cancelled.'
  if (normalized.includes('unlock')) return 'Unlock trace before publishing it.'
  if (normalized.includes('wallet') || normalized.includes('sign')) return message || 'Wallet signature could not be completed.'
  return 'Trace publication failed. Try again.'
}

function activeEvmConnectorId(wallet: ReturnType<typeof useWallet>) {
  if (wallet.activeWalletType === 'injected') return wallet.activeConnectorId ?? wallet.connectorId ?? 'browser'
  if (wallet.walletType === 'injected') return wallet.connectorId ?? 'browser'
  if (wallet.activeProvider) return wallet.activeConnectorId ?? 'browser'
  return 'browser'
}

function premiumTraceErrorMessage(error: ApiError): string {
  if (error.code === 'X402_NOT_CONFIGURED') {
    return 'Paid access is temporarily unavailable. Please try again later.'
  }
  if (error.code.startsWith('PAYMENT_') || error.code === 'ARC_RPC_FAILED' || error.code === 'ARC_CHAIN_MISMATCH') {
    return 'Paid access could not be confirmed. Please try the unlock again.'
  }
  if (error.code === 'TRACE_UPDATE_FAILED') {
    return 'Payment was confirmed but the trace record could not be refreshed. Try again in a moment.'
  }
  if (error.code.startsWith('X402_')) {
    return 'Paid access is temporarily unavailable. Please try again later.'
  }
  return error.message
}

function premiumTraceLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return premiumTraceErrorMessage(error)
  return error instanceof Error ? error.message : 'Trace not found.'
}

function isUnlockInFlight(state: UnlockState): boolean {
  return state === 'awaiting_wallet_approval' ||
    state === 'signing_payment_authorization' ||
    state === 'settling_payment' ||
    state === 'confirming_payment' ||
    state === 'payment_confirmed'
}

function unlockStatusMessage(state: UnlockState): string | null {
  if (state === 'awaiting_wallet_approval') return 'Awaiting wallet approval...'
  if (state === 'signing_payment_authorization') return 'Preparing Arc USDC payment...'
  if (state === 'settling_payment') return 'Settling USDC payment...'
  if (state === 'confirming_payment') return 'Confirming Arc transaction...'
  if (state === 'payment_confirmed') return 'Payment confirmed. Refreshing access...'
  if (state === 'trace_unlocked') return 'Trace unlocked.'
  if (state === 'unlock_failed') return 'Unlock failed.'
  return null
}

function publishStatusMessage(state: PublishState): string | null {
  if (state === 'awaiting_signature') return 'Awaiting publish signature...'
  if (state === 'publishing') return 'Publishing trace to Arc...'
  if (state === 'published') return 'Trace published.'
  if (state === 'failed') return 'Publication failed.'
  return null
}

function paywallStatusLabel(state: UnlockState): string {
  if (state === 'awaiting_wallet_approval') return 'awaiting wallet approval'
  if (state === 'signing_payment_authorization') return 'signing authorization'
  if (state === 'settling_payment') return 'settling USDC'
  if (state === 'confirming_payment') return 'confirming transaction'
  if (state === 'payment_confirmed') return 'payment confirmed'
  if (state === 'trace_unlocked') return 'trace unlocked'
  if (state === 'unlock_failed') return 'unlock failed'
  return 'payment required'
}

function paymentRailLabel(challenge: PaymentChallenge): string {
  const normalized = challenge.network.trim().toLowerCase()
  if (normalized === 'arc' || normalized === 'arc-testnet' || normalized === 'eip155:5042002') {
    return 'Arc USDC on Arc'
  }
  if (normalized.startsWith('eip155:')) {
    return `Arc USDC on chain ${normalized.slice('eip155:'.length)}`
  }
  return 'USDC on Arc'
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(timeoutMessage)), ms)
    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout))
  })
}

function traceToSummary(trace: ReasoningTrace): string {
  const verdict = trace.verdict?.action ?? convictionState(trace)
  return [
    `${trace.assetSymbol}: ${trace.market}`,
    `Verdict: ${verdict}`,
    `Access: ${traceAccessLabel(trace)}${trace.premium ? ` - ${traceUnlockPrice(trace)} USDC` : ''}`,
    `Side: ${sideLabel(trace.positionIntent.side)}; horizon: ${trace.positionIntent.timeHorizon}`,
    `Thesis: ${trace.thesis}`,
  ].join('\n')
}

function traceToMarkdown(trace: ReasoningTrace, steps: ReasoningStep[]): string {
  const lines = [
    `# Vestige Trace: ${trace.assetSymbol}`,
    '',
    `- Trace ID: ${trace.id}`,
    `- Market: ${trace.market}`,
    `- Created: ${formatDate(trace.createdAt)}`,
    `- Status: ${trace.status}`,
    `- Access tier: ${traceAccessLabel(trace)}`,
    `- Conviction state: ${convictionState(trace)}`,
    `- Positioning: ${trace.verdict?.action ?? sideLabel(trace.positionIntent.side)}`,
    `- Paid unlocks: ${traceUnlockCount(trace)}`,
    '',
    '## Thesis',
    trace.thesis,
    '',
    '## Verdict',
    trace.verdict
      ? `${trace.verdict.action}: ${trace.verdict.summary}`
      : 'No structured verdict recorded.',
    '',
    '## Reasoning Chain',
    ...steps.flatMap((step) => [
      '',
      `### ${step.order + 1}. ${step.title}`,
      step.observation,
      '',
      step.inference,
      ...(step.evidence?.length ? ['', ...step.evidence.map((item) => `- ${item}`)] : []),
    ]),
    '',
    '## Risks',
    ...(trace.risks.length ? trace.risks.map((item) => `- ${item}`) : ['- None recorded.']),
    '',
    '## Catalysts',
    ...(trace.catalysts.length ? trace.catalysts.map((item) => `- ${item}`) : ['- None recorded.']),
  ]
  return lines.join('\n')
}

async function digestTrace(trace: ReasoningTrace): Promise<string> {
  const payload = JSON.stringify({
    id: trace.id,
    market: trace.market,
    assetSymbol: trace.assetSymbol,
    thesis: trace.thesis,
    reasoningSteps: trace.reasoningSteps,
    risks: trace.risks,
    catalysts: trace.catalysts,
    confidence: trace.confidence,
    positionIntent: trace.positionIntent,
    verdict: trace.verdict,
    createdAt: trace.createdAt,
  })
  const bytes = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function uniqueReceipts(receipts: TracePaymentReceipt[]): TracePaymentReceipt[] {
  const seen = new Set<string>()
  return receipts.filter(receipt => {
    const key = receipt.receiptId || receipt.txHash || receipt.unlockedAt
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function uniquePublicationReceipts(receipts: TracePublicationReceipt[]): TracePublicationReceipt[] {
  const seen = new Set<string>()
  return receipts.filter(receipt => {
    const key = receipt.publicationId || receipt.contentDigest || receipt.publishedAt
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
