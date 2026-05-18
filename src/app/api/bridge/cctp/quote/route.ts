import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createCctpBridgeService } from "@/backend/bridge/cctp.service";
import { VestigeError } from "@/backend/shared/errors";
import type { ApiErrorResponse, CctpQuoteRequest, CctpQuoteResponse } from "@/backend/shared/types/api";

export async function POST(request: Request): Promise<NextResponse<CctpQuoteResponse | ApiErrorResponse>> {
  try {
    const body = await request.json() as CctpQuoteRequest;
    const quote = await createCctpBridgeService().quote(body);
    return NextResponse.json(quote);
  } catch (error) {
    const status = error instanceof ZodError
      ? 400
      : error instanceof VestigeError && error.code === "CCTP_NOT_CONFIGURED"
        ? 501
        : 500;
    return NextResponse.json(
      {
        error: {
          code: error instanceof VestigeError ? error.code : error instanceof ZodError ? "VALIDATION_FAILED" : "CCTP_QUOTE_FAILED",
          message: error instanceof Error ? error.message : "Failed to create CCTP quote.",
        },
      },
      { status },
    );
  }
}
