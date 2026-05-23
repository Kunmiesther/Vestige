import type { ReasoningTrace, TracePaymentReceipt } from "../shared/types/trace";

export function traceUnlockPrice(trace: ReasoningTrace): string {
  return trace.unlockPriceUsdc ?? process.env.X402_PREMIUM_TRACE_USDC ?? "0.01";
}

export function traceUnlockCount(trace: ReasoningTrace): number {
  return trace.unlockCount ?? trace.paymentReceipts?.length ?? 0;
}

export function traceTotalUsdcGenerated(trace: ReasoningTrace): string {
  const receipts = trace.paymentReceipts ?? [];
  if (receipts.length === 0) {
    const generated = traceUnlockCount(trace) * (Number.parseFloat(traceUnlockPrice(trace)) || 0);
    return generated.toFixed(2);
  }

  const total = receipts.reduce((sum, receipt) => sum + (Number.parseFloat(receipt.amount) || 0), 0);
  return total.toFixed(2);
}

export function hasReceiptForPayment(
  trace: ReasoningTrace,
  paymentHeader: string | null,
  walletAddress?: string | null,
): TracePaymentReceipt | undefined {
  const normalized = normalizePaymentHeader(paymentHeader);
  if (!normalized) return undefined;
  const normalizedWallet = normalizeAddress(walletAddress);

  return trace.paymentReceipts?.find((receipt) => {
    const receiptMatches = normalizeReceiptIdentifier(receipt) === normalized ||
      receipt.receiptId === normalized ||
      receipt.txHash === normalized ||
      receipt.facilitatorReference === normalized;
    if (!receiptMatches) return false;

    const receiptPayer = normalizeAddress(receipt.payer);
    return !normalizedWallet || !receiptPayer || receiptPayer === normalizedWallet;
  });
}

export function buildLockedTracePreview(trace: ReasoningTrace) {
  const accessTier: Exclude<ReasoningTrace["accessTier"], "public" | undefined> =
    trace.accessTier === "institutional" ? "institutional" : "premium";
  return {
    id: trace.id,
    market: trace.market,
    assetSymbol: trace.assetSymbol,
    accessTier,
    unlockPriceUsdc: traceUnlockPrice(trace),
    unlockCount: traceUnlockCount(trace),
    totalUsdcGenerated: traceTotalUsdcGenerated(trace),
    creatorWalletAddress: trace.creatorWalletAddress,
    demandScore: trace.demandScore ?? traceUnlockCount(trace),
    createdAt: trace.createdAt,
  };
}

export function maskTraceForLockedAccess(trace: ReasoningTrace): ReasoningTrace {
  const preview = buildLockedTracePreview(trace);
  return {
    ...trace,
    thesis: "Locked intelligence trace. Unlock with USDC to view committee reasoning.",
    reasoningSteps: [],
    risks: [],
    catalysts: [],
    verdict: undefined,
    rawModelOutput: undefined,
    positionIntent: {
      side: "neutral",
      timeHorizon: "swing",
    },
    confidence: "medium",
    premium: true,
    accessTier: preview.accessTier,
    unlockPriceUsdc: preview.unlockPriceUsdc,
    unlockCount: preview.unlockCount,
    demandScore: preview.demandScore,
    paymentReceipts: trace.paymentReceipts ?? [],
    traceMetrics: undefined,
    locked: true,
  };
}

export function ensureTraceIsPaid(trace: ReasoningTrace): ReasoningTrace {
  return {
    ...trace,
    premium: true,
    accessTier: trace.accessTier === "institutional" ? "institutional" : "premium",
    unlockPriceUsdc: traceUnlockPrice(trace),
    locked: true,
  };
}

function normalizePaymentHeader(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const candidate = record.receiptId ?? record.txHash ?? record.facilitatorReference ?? record.id;
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  } catch {}

  return trimmed;
}

function normalizeReceiptIdentifier(receipt: TracePaymentReceipt): string {
  return receipt.receiptId || receipt.txHash || receipt.facilitatorReference || receipt.unlockedAt;
}

function normalizeAddress(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || undefined;
}
