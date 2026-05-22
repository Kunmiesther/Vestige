import { NextResponse } from "next/server";
import { createX402Service } from "@/backend/payments/x402.service";
import { VestigeError } from "@/backend/shared/errors";
import type { ApiErrorResponse, PaymentChallenge, PremiumTraceResponse } from "@/backend/shared/types/api";
import { createTraceRepository } from "@/backend/traces/trace.repository";

interface RouteContext {
  params: Promise<{ traceId: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<PremiumTraceResponse | { paymentRequired: PaymentChallenge } | ApiErrorResponse>> {
  try {
    const { traceId } = await context.params;
    const trace = await createTraceRepository().findTrace(traceId);
    if (!trace) {
      return NextResponse.json(
        { error: { code: "TRACE_NOT_FOUND", message: "Trace not found." } },
        { status: 404 },
      );
    }

    if (!trace.premium && trace.accessTier !== "premium" && trace.accessTier !== "institutional") {
      return NextResponse.json({ trace });
    }

    const access = await createX402Service().authorize(request.headers, `/api/traces/${traceId}/premium`);
    if (!access.allowed && access.challenge) {
      return NextResponse.json(
        {
          paymentRequired: access.challenge,
          tracePreview: {
            id: trace.id,
            market: trace.market,
            assetSymbol: trace.assetSymbol,
            accessTier: trace.accessTier ?? ((trace.verdict?.score ?? 0) >= 81 ? "institutional" : "premium"),
            unlockPriceUsdc: trace.unlockPriceUsdc ?? access.challenge.amount,
            unlockCount: trace.unlockCount ?? trace.paymentReceipts?.length ?? 0,
            demandScore: trace.demandScore ?? 0,
            createdAt: trace.createdAt,
          },
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
      const updatedTrace = {
        ...trace,
        paymentReceipts: [...(trace.paymentReceipts ?? []), access.receipt],
        unlockCount: (trace.unlockCount ?? trace.paymentReceipts?.length ?? 0) + 1,
        demandScore: (trace.demandScore ?? 0) + 1,
      };

      await createTraceRepository().updateTrace(updatedTrace).catch((error) => {
        console.error("[vestige:x402:receipt-persist-failed]", {
          traceId,
          message: error instanceof Error ? error.message : "unknown error",
        });
      });

      return NextResponse.json({ trace: updatedTrace, receipt: access.receipt });
    }

    return NextResponse.json({ trace });
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
