import { NextResponse } from 'next/server'
import { createTraceRepository } from '../../../../backend/traces/trace.repository'
import type { ListAgentsResponse } from '../../../../backend/shared/types/api'
import type { ApiErrorResponse } from '../../../../backend/shared/types/api'

export async function GET(): Promise<NextResponse<ListAgentsResponse | ApiErrorResponse>> {
  try {
    const repo = createTraceRepository()
    const agents = await repo.listAgents()
    return NextResponse.json({ agents })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list agents'
    return NextResponse.json(
      { error: { code: 'LIST_AGENTS_FAILED', message } },
      { status: 500 }
    )
  }
}
