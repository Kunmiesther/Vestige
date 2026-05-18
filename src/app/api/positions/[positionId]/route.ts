import { NextResponse } from "next/server";
import { createPositionService } from "@/backend/positions/position.service";
import type { ApiErrorResponse } from "@/backend/shared/types/api";
import type { Position } from "@/backend/shared/types/position";

interface RouteContext {
  params: Promise<{ positionId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse<{ position: Position } | ApiErrorResponse>> {
  try {
    const { positionId } = await context.params;
    const position = await createPositionService().get(positionId);
    if (!position) {
      return NextResponse.json(
        { error: { code: "POSITION_NOT_FOUND", message: "Position not found." } },
        { status: 404 },
      );
    }

    return NextResponse.json({ position });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "GET_POSITION_FAILED",
          message: error instanceof Error ? error.message : "Failed to get position.",
        },
      },
      { status: 500 },
    );
  }
}
