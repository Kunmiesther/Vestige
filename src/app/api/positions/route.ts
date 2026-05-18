import { NextResponse } from "next/server";
import { createPositionService } from "@/backend/positions/position.service";
import type { ApiErrorResponse, ListPositionsResponse } from "@/backend/shared/types/api";

export async function GET(request: Request): Promise<NextResponse<ListPositionsResponse | ApiErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const positions = await createPositionService().list({
      agentId: searchParams.get("agentId") ?? undefined,
      isOpen: searchParams.has("isOpen") ? searchParams.get("isOpen") === "true" : undefined,
    });

    return NextResponse.json({ positions });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "LIST_POSITIONS_FAILED",
          message: error instanceof Error ? error.message : "Failed to list positions.",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(): Promise<NextResponse<ListPositionsResponse | ApiErrorResponse>> {
  try {
    const positions = await createPositionService().syncOpenPrices();
    return NextResponse.json({ positions });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "SYNC_POSITIONS_FAILED",
          message: error instanceof Error ? error.message : "Failed to sync positions.",
        },
      },
      { status: 500 },
    );
  }
}
