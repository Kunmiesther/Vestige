import { NextResponse } from 'next/server'
import { createTraceRepository } from '@/backend/traces/trace.repository'
import type { ListTracesResponse, ListTracesQuery } from '@/backend/shared/types/api'
import { maskTraceForLockedAccess } from '@/backend/traces/trace.access'

export async function GET(request: Request): Promise<NextResponse<ListTracesResponse>> {
  try {
    const { searchParams } = new URL(request.url)
    const query: ListTracesQuery = {
      agentId: searchParams.get('agentId') ?? undefined,
      assetSymbol: searchParams.get('assetSymbol') ?? undefined,
      limit: searchParams.has('limit') ? parseInt(searchParams.get('limit')!) : 50,
      cursor: searchParams.get('cursor') ?? undefined,
    }

    const repo = createTraceRepository()
    const traces = await repo.listTraces(query)

    return NextResponse.json({ traces: traces.map(maskTraceForLockedAccess), nextCursor: undefined })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list traces'
    return NextResponse.json(
      { traces: [], error: { code: 'LIST_TRACES_FAILED', message } } as unknown as ListTracesResponse,
      { status: 500 }
    )
  }
}
