import { NextResponse } from "next/server";
import type { ApiErrorResponse } from "@/backend/shared/types/api";
import { createTraceRepository } from "@/backend/traces/trace.repository";
import { createPositionService } from "@/backend/positions/position.service";

export async function POST(): Promise<NextResponse<{ synced: number } | ApiErrorResponse>> {
  try {
    const service = createPositionService(createTraceRepository());
    const positions = await service.syncOpenPrices();
    return NextResponse.json({ synced: positions.length });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "POSITION_PRICE_SYNC_FAILED",
          message: error instanceof Error ? error.message : "Failed to sync open position prices.",
        },
      },
      { status: 500 },
    );
  }
}
