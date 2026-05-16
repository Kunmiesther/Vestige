import { NextResponse } from 'next/server'
import { createTraceRepository } from '../../../../../backend/traces/trace.repository'
import type { GetTraceResponse } from '../../../../../backend/shared/types/api'
import type { ApiErrorResponse } from '../../../../../backend/shared/types/api'

interface RouteContext {
  params: Promise<{ traceId: string }>
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<NextResponse<GetTraceResponse | ApiErrorResponse>> {
  try {
    const { traceId } = await context.params
    const repo = createTraceRepository()
    const trace = await repo.findTrace(traceId)

    if (!trace) {
      return NextResponse.json(
        { error: { code: 'TRACE_NOT_FOUND', message: `Trace ${traceId} not found` } },
        { status: 404 }
      )
    }

    return NextResponse.json({ trace })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get trace'
    return NextResponse.json(
      { error: { code: 'GET_TRACE_FAILED', message } },
      { status: 500 }
    )
  }
}
