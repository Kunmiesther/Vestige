import { NextResponse } from 'next/server'
import { createTraceRepository } from '@/backend/traces/trace.repository'
import type { GetTraceResponse, ApiErrorResponse } from '@/backend/shared/types/api'
import { hasReceiptForPayment, maskTraceForLockedAccess } from '@/backend/traces/trace.access'

interface RouteContext {
  params: Promise<{ traceId: string }>
}

export async function GET(
  request: Request,
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

    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress') ?? request.headers.get('x-vestige-wallet-address')
    const receipt = hasReceiptForPayment(trace, null, walletAddress)

    return NextResponse.json({
      trace: receipt ? { ...trace, locked: false } : maskTraceForLockedAccess(trace),
      receipt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get trace'
    return NextResponse.json(
      { error: { code: 'GET_TRACE_FAILED', message } },
      { status: 500 }
    )
  }
}
