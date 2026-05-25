import type { ReasoningTrace, TracePaymentReceipt } from "../shared/types/trace";

export function traceUnlockPrice(trace: ReasoningTrace): string {
  return trace.unlockPriceUsdc ?? process.env.X402_PREMIUM_TRACE_USDC ?? "0.01";
}

export function traceUnlockCount(trace: ReasoningTrace): number {
  return confirmedReceipts(trace.paymentReceipts ?? []).length;
}

export function traceTotalUsdcGenerated(trace: ReasoningTrace): string {
  const receipts = confirmedReceipts(trace.paymentReceipts ?? []);
  const total = receipts.reduce((sum, receipt) => sum + (Number.parseFloat(receipt.amount) || 0), 0);
  return total.toFixed(2);
}

export function hasReceiptForPayment(
  trace: ReasoningTrace,
  paymentHeader: string | null,
  walletAddress?: string | null,
): TracePaymentReceipt | undefined {
  const normalized = normalizePaymentHeader(paymentHeader);
  const normalizedWallet = normalizeAddress(walletAddress);
  if (!normalized && !normalizedWallet) return undefined;

  return confirmedReceipts(trace.paymentReceipts ?? []).find((receipt) => {
    const receiptPayer = normalizeAddress(receipt.payer);
    if (!normalized && normalizedWallet) {
      return receiptPayer === normalizedWallet;
    }

    const receiptMatches = normalizeReceiptIdentifier(receipt) === normalized ||
      receipt.receiptId === normalized ||
      receipt.txHash === normalized;
    if (!receiptMatches) return false;

    return !normalizedWallet || !receiptPayer || receiptPayer === normalizedWallet;
  });
}

export function buildLockedTracePreview(trace: ReasoningTrace) {
  const accessTier: Exclude<ReasoningTrace["accessTier"], "public" | undefined> =
    trace.accessTier === "institutional" ? "institutional" : "premium";
  const paymentReceipts = confirmedReceipts(trace.paymentReceipts ?? []);
  const publicationReceipts = trace.publicationReceipts ?? [];
  return {
    id: trace.id,
    market: trace.market,
    assetSymbol: trace.assetSymbol,
    accessTier,
    unlockPriceUsdc: traceUnlockPrice(trace),
    unlockCount: paymentReceipts.length,
    totalUsdcGenerated: sumUsdc(paymentReceipts),
    creatorWalletAddress: trace.creatorWalletAddress,
    demandScore: trace.demandScore ?? traceUnlockCount(trace),
    publicationCount: publicationReceipts.length,
    lastPaymentReceipt: latestPaymentReceipt(paymentReceipts),
    lastPublicationReceipt: latestPublicationReceipt(publicationReceipts),
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
    verdict: trace.verdict,
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
      const candidate = record.txHash ?? record.receiptId ?? record.id;
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  } catch {}

  return trimmed;
}

function normalizeReceiptIdentifier(receipt: TracePaymentReceipt): string {
  return receipt.txHash || receipt.receiptId;
}

function confirmedReceipts(receipts: TracePaymentReceipt[]): TracePaymentReceipt[] {
  return receipts.filter((receipt) =>
    receipt.settlementStatus === "confirmed" &&
    /^0x[0-9a-fA-F]{64}$/.test(receipt.txHash ?? receipt.receiptId),
  );
}

function sumUsdc(receipts: TracePaymentReceipt[]): string {
  const total = receipts.reduce((sum, receipt) => sum + (Number.parseFloat(receipt.amount) || 0), 0);
  return total.toFixed(2);
}

function latestPaymentReceipt(receipts: TracePaymentReceipt[]): TracePaymentReceipt | undefined {
  return receipts.slice().sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime())[0];
}

function latestPublicationReceipt(
  receipts: NonNullable<ReasoningTrace["publicationReceipts"]>,
): NonNullable<ReasoningTrace["publicationReceipts"]>[number] | undefined {
  return receipts.slice().sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
}

function normalizeAddress(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || undefined;
}
