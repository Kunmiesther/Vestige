import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createPositionService } from "@/backend/positions/position.service";
import type { ApiErrorResponse, FollowPositionRequest, FollowPositionResponse } from "@/backend/shared/types/api";

interface RouteContext {
  params: Promise<{ positionId: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<FollowPositionResponse | ApiErrorResponse>> {
  try {
    const { positionId } = await context.params;
    const body = await request.json() as FollowPositionRequest;
    const follow = await createPositionService().follow(positionId, body.userId);
    return NextResponse.json({ followed: true, follow });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: error.message } },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Failed to follow position.";
    return NextResponse.json(
      { error: { code: message.includes("not found") ? "POSITION_NOT_FOUND" : "FOLLOW_POSITION_FAILED", message } },
      { status: message.includes("not found") ? 404 : 500 },
    );
  }
}
