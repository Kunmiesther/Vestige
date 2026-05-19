import { NextRequest, NextResponse } from 'next/server'
import { createTraceRepository } from '@/backend/traces/trace.repository'
import { createTracePublisher } from '@/backend/traces/trace.publisher'
import type { ReasoningTrace } from '@/backend/shared/types/trace'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
): Promise<NextResponse<{ trace: ReasoningTrace } | { error: { code: string; message: string } }>> {
  try {
    const { traceId } = await params
    const body = await request.json().catch(() => ({})) as {
      txHash?: string
      publisherAddress?: string
      publisherWalletType?: 'circle' | 'injected'
      publisherWalletId?: string
      signature?: string
      message?: string
    }
    const repository = createTraceRepository()
    const trace = await repository.findTrace(traceId)

    if (!trace) {
      return NextResponse.json(
        { error: { code: 'TRACE_NOT_FOUND', message: 'Trace not found.' } },
        { status: 404 },
      )
    }

    if (trace.status === 'published' || trace.status === 'pinned') {
      return NextResponse.json({ trace })
    }

    const publisher = createTracePublisher(repository)
    return NextResponse.json({
      trace: await publisher.publish(trace.id, {
        txHash: body.txHash,
        publisherAddress: body.publisherAddress,
        publisherWalletType: body.publisherWalletType,
        publisherWalletId: body.publisherWalletId,
        signature: body.signature,
        message: body.message,
      }),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'PUBLISH_TRACE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to publish trace.',
        },
      },
      { status: 500 },
    )
  }
}
