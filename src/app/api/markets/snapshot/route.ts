import { NextResponse } from "next/server";
import { createMarketDataService } from "@/backend/markets/market.service";
import { VestigeError } from "@/backend/shared/errors";
import type { MarketSnapshot } from "@/backend/markets/market.types";
import type { ApiErrorResponse } from "@/backend/shared/types/api";

export async function GET(request: Request): Promise<NextResponse<{ snapshot: MarketSnapshot | null } | ApiErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") ?? "";
    const snapshot = await createMarketDataService().getSnapshot(symbol);
    return NextResponse.json({ snapshot });
  } catch (error) {
    const status = error instanceof VestigeError && error.code === "MARKET_SYMBOL_REQUIRED" ? 400 : 502;
    return NextResponse.json(
      {
        error: {
          code: error instanceof VestigeError ? error.code : "MARKET_SNAPSHOT_FAILED",
          message: error instanceof Error ? error.message : "Failed to fetch market snapshot.",
        },
      },
      { status },
    );
  }
}
