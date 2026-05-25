import { NextResponse } from "next/server";
import { createX402Service } from "@/backend/payments/x402.service";
import { VestigeError } from "@/backend/shared/errors";
import type { ApiErrorResponse, PremiumTracePaymentRequiredResponse, PremiumTraceResponse } from "@/backend/shared/types/api";
import {
  buildLockedTracePreview,
  hasReceiptForPayment,
  maskTraceForLockedAccess,
  traceUnlockCount,
} from "@/backend/traces/trace.access";
import { createTraceRepository } from "@/backend/traces/trace.repository";

interface RouteContext {
  params: Promise<{ traceId: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<PremiumTraceResponse | PremiumTracePaymentRequiredResponse | ApiErrorResponse>> {
  try {
    const { traceId } = await context.params;
    const repo = createTraceRepository();
    const trace = await repo.findTrace(traceId);
    if (!trace) {
      return NextResponse.json(
        { error: { code: "TRACE_NOT_FOUND", message: "Trace not found." } },
        { status: 404 },
      );
    }

    const suppliedReceipt = request.headers.get("x-vestige-unlock-receipt");
    const walletAddress = request.headers.get("x-vestige-wallet-address");
    const existingReceipt = hasReceiptForPayment(trace, suppliedReceipt, walletAddress);
    if (existingReceipt) {
      return NextResponse.json({ trace: { ...trace, locked: false }, receipt: existingReceipt });
    }

    const access = await createX402Service().authorize(request.headers, `/api/traces/${traceId}/premium`);
    if (!access.allowed && access.challenge) {
      return NextResponse.json(
        {
          paymentRequired: access.challenge,
          tracePreview: buildLockedTracePreview(trace),
        },
        {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": JSON.stringify(access.challenge),
            "Payment-Required": JSON.stringify(access.challenge),
          },
        },
      );
    }

    if (access.receipt) {
      const paymentReceipts = uniquePaymentReceipts([
        ...(trace.paymentReceipts ?? []),
        access.receipt,
      ]);
      const existingCount = traceUnlockCount(trace);
      const newCount = paymentReceipts.length;
      const demandIncrement = Math.max(0, newCount - existingCount);
      const persistedTrace = {
        ...trace,
        locked: true,
        paymentReceipts,
        unlockCount: newCount,
        demandScore: Math.max(trace.demandScore ?? existingCount, existingCount) + demandIncrement,
      };

      await repo.updateTrace(persistedTrace);

      return NextResponse.json(
        { trace: { ...persistedTrace, locked: false }, receipt: access.receipt },
        {
          headers: {
            "PAYMENT-RESPONSE": JSON.stringify(access.receipt),
          },
        },
      );
    }

    return NextResponse.json({ trace: maskTraceForLockedAccess(trace) });
  } catch (error) {
    console.error("[vestige:trace-access:failed]", {
      message: error instanceof Error ? error.message : "unknown",
      code: error instanceof VestigeError ? error.code : "PREMIUM_TRACE_FAILED",
    });
    const status = error instanceof VestigeError
      ? error.code === "X402_NOT_CONFIGURED"
        ? 501
        : error.code.startsWith("PAYMENT_") || error.code === "ARC_RPC_FAILED" || error.code === "ARC_CHAIN_MISMATCH"
          ? 402
          : error.code === "TRACE_UPDATE_FAILED"
            ? 503
            : 500
      : 500;
    return NextResponse.json(
      {
        error: {
          code: error instanceof VestigeError ? error.code : "PREMIUM_TRACE_FAILED",
          message: error instanceof Error ? error.message : "Failed to load premium trace.",
        },
      },
      { status },
    );
  }
}

function uniquePaymentReceipts(receipts: NonNullable<PremiumTraceResponse["trace"]["paymentReceipts"]>) {
  const seen = new Set<string>();
  return receipts.filter((receipt) => {
    const key = receipt.txHash ?? receipt.receiptId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
