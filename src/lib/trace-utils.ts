import type { ReasoningTrace, ConfidenceLevel, TraceStatus, PositionSide } from '@/backend/shared/types/trace'

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

export function confidenceLabel(c: ConfidenceLevel): string {
  return c.charAt(0).toUpperCase() + c.slice(1)
}

export function statusLabel(s: TraceStatus): string {
  const map: Record<TraceStatus, string> = {
    draft: 'Draft',
    stored: 'Stored',
    pinned: 'Published',
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
  if (trace.status === 'pinned' || trace.status === 'stored') return 'active'
  return 'watching'
}
