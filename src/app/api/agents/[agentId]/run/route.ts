import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createAgentRunner } from '@/backend/agents/agent.runner'
import { VestigeError } from '@/backend/shared/errors'
import type { ApiErrorResponse, RunAgentRequest, RunAgentResponse } from '@/backend/shared/types/api'

interface RouteContext {
  params: Promise<{
    agentId: string;
  }>;
}

export async function POST(
  request: Request,
  context: RouteContext
): Promise<NextResponse<RunAgentResponse | ApiErrorResponse>> {
  try {
    const { agentId } = await context.params;
    const body = (await request.json()) as unknown;
    const runner = createAgentRunner();
    const result = await runner.run(agentId, body as RunAgentRequest);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown): NextResponse<ApiErrorResponse> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: error.message } },
      { status: 400 }
    );
  }

  if (error instanceof VestigeError) {
    const status = error.code === "AGENT_NOT_FOUND" ? 404 : 422;
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status }
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected agent run failure.";
  return NextResponse.json(
    { error: { code: "AGENT_RUN_FAILED", message } },
    { status: 500 }
  );
}