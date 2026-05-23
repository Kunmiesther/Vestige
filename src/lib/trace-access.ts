import type { TracePaymentReceipt } from '@/backend/shared/types/trace'

const TRACE_ACCESS_PREFIX = 'vestige_trace_access:'

export interface StoredTraceAccess {
  traceId: string
  receiptId: string
  txHash?: string
  payer?: string
  payTo?: string
  amount: string
  asset: 'USDC'
  network: string
  unlockedAt: string
}

export function saveTraceAccess(traceId: string, receipt: TracePaymentReceipt): void {
  if (typeof window === 'undefined' || !traceId || !receipt.receiptId) return
  const record: StoredTraceAccess = {
    traceId,
    receiptId: receipt.receiptId,
    txHash: receipt.txHash,
    payer: receipt.payer,
    payTo: receipt.payTo,
    amount: receipt.amount,
    asset: receipt.asset,
    network: receipt.network,
    unlockedAt: receipt.unlockedAt,
  }

  try {
    window.localStorage.setItem(key(traceId), JSON.stringify(record))
  } catch {}
}

export function loadTraceAccess(traceId: string): StoredTraceAccess | null {
  if (typeof window === 'undefined' || !traceId) return null
  try {
    const raw = window.localStorage.getItem(key(traceId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredTraceAccess>
    if (
      parsed.traceId === traceId &&
      typeof parsed.receiptId === 'string' &&
      parsed.receiptId.trim() &&
      parsed.asset === 'USDC' &&
      typeof parsed.amount === 'string' &&
      typeof parsed.network === 'string' &&
      typeof parsed.unlockedAt === 'string'
    ) {
      return parsed as StoredTraceAccess
    }
  } catch {}
  return null
}

function key(traceId: string): string {
  return `${TRACE_ACCESS_PREFIX}${traceId}`
}
