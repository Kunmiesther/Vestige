import type { ReasoningTrace, TraceStatus, PositionSide, TraceAccessTier } from '@/backend/shared/types/trace'

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  })
}

export function truncateHash(hash: string, chars = 10): string {
  if (hash.length <= chars + 6) return hash
  return `${hash.slice(0, chars)}…${hash.slice(-6)}`
}

export function convictionState(trace: ReasoningTrace): string {
  if (trace.locked) return 'LOCKED'
  const score = trace.verdict?.score
  if (trace.verdict?.action) return trace.verdict.action
  if (trace.traceMetrics?.convictionTemperature) return convictionTemperatureToState(trace.traceMetrics.convictionTemperature)
  return scoreToConvictionState(score)
}

export function scoreToConvictionState(score: number | undefined): string {
  if (typeof score === 'number') {
    if (score <= 25) return 'Liquidity Trap Risk'
    if (score <= 42) return 'Structure Weakening'
    if (score <= 58) return 'Conviction Divergence'
    if (score <= 74) return 'Momentum Favors Continuation'
    return 'Expansion Setup'
  }
  return 'Regime Shift Watch'
}

export function traceAccessTier(trace: ReasoningTrace): TraceAccessTier {
  if (trace.accessTier) return trace.accessTier
  if (!trace.premium) return 'public'
  if ((trace.verdict?.score ?? 0) >= 81) return 'institutional'
  return 'premium'
}

export function traceAccessLabel(trace: ReasoningTrace): string {
  return trace.locked ? 'LOCKED' : traceAccessTier(trace).toUpperCase()
}

export function traceUnlockPrice(trace: ReasoningTrace): string {
  return trace.unlockPriceUsdc ?? '0.01'
}

export function traceUnlockCount(trace: ReasoningTrace): number {
  return trace.paymentReceipts?.filter(isConfirmedPaymentReceipt).length ?? 0
}

export function metricLabel(value: number | undefined): string {
  if (typeof value !== 'number') return 'No data yet'
  if (value >= 0.75) return 'High'
  if (value >= 0.5) return 'Moderate'
  if (value >= 0.25) return 'Thin'
  return 'Low'
}

export function deriveAuditMetrics(trace: ReasoningTrace) {
  if (trace.locked || !trace.traceMetrics) {
    return {
      marketRegime: 'No data yet',
      liquidityState: 'No data yet',
      volatilityState: 'No data yet',
      alignment: undefined,
      pressure: undefined,
      catalystStrength: undefined,
      disagreement: undefined,
      convictionTemperature: 'LOCKED',
    }
  }

  const score = trace.verdict?.score ?? (trace.confidence === 'high' ? 78 : trace.confidence === 'medium' ? 52 : 28)

  return {
    marketRegime: trace.traceMetrics.marketRegime ?? 'No data yet',
    liquidityState: trace.traceMetrics.liquidityState ?? 'No data yet',
    volatilityState: trace.traceMetrics.volatilityState ?? 'No data yet',
    alignment: trace.traceMetrics.alignment ?? clamp(score / 100),
    pressure: trace.traceMetrics.pressure ?? clamp((100 - score) / 100),
    catalystStrength: trace.traceMetrics.catalystStrength ?? undefined,
    disagreement: trace.traceMetrics.disagreement ?? undefined,
    convictionTemperature: trace.traceMetrics.convictionTemperature ?? convictionState(trace),
  }
}

export function statusLabel(s: TraceStatus): string {
  const map: Record<TraceStatus, string> = {
    draft: 'Draft',
    stored: 'Stored',
    failed: 'Failed',
  }
  return map[s] ?? s
}

export function sideLabel(s: PositionSide): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function sideColor(s: PositionSide): string {
  if (s === 'long') return 'var(--lime)'
  if (s === 'short') return 'var(--ember)'
  return 'var(--text-secondary)'
}

/**
 * Derive a one-line "edge" summary from a trace for the dashboard list view.
 * Uses the first reasoning step's inference as a proxy for edge if no
 * dedicated edge field exists on the backend type.
 */
export function deriveEdge(trace: ReasoningTrace): string {
  if (trace.locked) {
    return `Locked intelligence. Unlock for ${trace.unlockPriceUsdc ?? '0.01'} USDC.`
  }
  if (trace.reasoningSteps.length > 0) {
    const first = trace.reasoningSteps[0]
    return first.inference.length > 120
      ? first.inference.slice(0, 120) + '…'
      : first.inference
  }
  return trace.thesis.length > 120
    ? trace.thesis.slice(0, 120) + '…'
    : trace.thesis
}

/**
 * Derive a status badge label from trace status + position side.
 * Maps to the visual language of the dashboard.
 */
export function deriveBadgeStatus(trace: ReasoningTrace): 'active' | 'watching' | 'neutral' | 'exited' {
  if (trace.status === 'failed') return 'exited'
  if (trace.positionIntent.side === 'neutral') return 'watching'
  if (trace.status === 'stored') return 'active'
  return 'watching'
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, char => char.toUpperCase())
}

function convictionTemperatureToState(value: string): string {
  const normalized = value.toLowerCase()
  if (normalized.includes('cold')) return 'Liquidity Trap Risk'
  if (normalized.includes('defensive')) return 'Structure Weakening'
  if (normalized.includes('balanced')) return 'Conviction Divergence'
  if (normalized.includes('warming')) return 'Momentum Favors Continuation'
  if (normalized.includes('hot')) return 'Expansion Setup'
  return titleCase(value)
}

function isConfirmedPaymentReceipt(receipt: NonNullable<ReasoningTrace['paymentReceipts']>[number]): boolean {
  return receipt.settlementStatus === 'confirmed' && /^0x[0-9a-fA-F]{64}$/.test(receipt.txHash ?? receipt.receiptId)
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
