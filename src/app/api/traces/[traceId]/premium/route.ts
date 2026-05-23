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
            "Payment-Required": JSON.stringify(access.challenge),
          },
        },
      );
    }

    if (access.receipt) {
      const persistedTrace = {
        ...trace,
        locked: true,
        paymentReceipts: [...(trace.paymentReceipts ?? []), access.receipt],
        unlockCount: traceUnlockCount(trace) + 1,
        demandScore: (trace.demandScore ?? 0) + 1,
      };

      await repo.updateTrace(persistedTrace).catch((error) => {
        console.error("[vestige:x402:receipt-persist-failed]", {
          traceId,
          message: error instanceof Error ? error.message : "unknown error",
        });
      });

      return NextResponse.json({ trace: { ...persistedTrace, locked: false }, receipt: access.receipt });
    }

    return NextResponse.json({ trace: maskTraceForLockedAccess(trace) });
  } catch (error) {
    const status = error instanceof VestigeError
      ? error.code === "X402_NOT_CONFIGURED" || error.code === "X402_FACILITATOR_NOT_CONFIGURED"
        ? 501
        : error.code === "X402_PAYMENT_REJECTED"
          ? 402
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
