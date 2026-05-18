import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createCctpBridgeService } from "@/backend/bridge/cctp.service";
import { VestigeError } from "@/backend/shared/errors";
import type { ApiErrorResponse, CctpTransferRequest, CctpTransferResponse } from "@/backend/shared/types/api";

export async function POST(request: Request): Promise<NextResponse<CctpTransferResponse | ApiErrorResponse>> {
  try {
    const body = await request.json() as CctpTransferRequest;
    const transfer = await createCctpBridgeService().transfer(body);
    return NextResponse.json(transfer);
  } catch (error) {
    const status = error instanceof ZodError
      ? 400
      : error instanceof VestigeError && error.code === "CCTP_NOT_CONFIGURED"
        ? 501
        : error instanceof VestigeError && error.code === "CCTP_WALLET_REQUIRED"
          ? 400
          : 500;
    return NextResponse.json(
      {
        error: {
          code: error instanceof VestigeError ? error.code : error instanceof ZodError ? "VALIDATION_FAILED" : "CCTP_TRANSFER_FAILED",
          message: error instanceof Error ? error.message : "Failed to submit CCTP transfer.",
        },
      },
      { status },
    );
  }
}
