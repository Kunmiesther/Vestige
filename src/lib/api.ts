/**
 * Vestige frontend API utility
 * Typed wrappers around all backend endpoints.
 * All functions throw ApiError on non-2xx responses.
 */

import type { Agent } from '@/backend/shared/types/agent'
import type { ReasoningTrace } from '@/backend/shared/types/trace'
import type { Position } from '@/backend/shared/types/position'
import type { MarketSnapshot } from '@/backend/markets/market.types'
import type {
  RunAgentRequest,
  RunAgentResponse,
  ListAgentsResponse,
  ListTracesResponse,
  GetTraceResponse,
  GetMarketSnapshotResponse,
  CctpQuoteRequest,
  CctpQuoteResponse,
  CctpTransferRequest,
  CctpTransferResponse,
  ApiErrorResponse,
} from '@/backend/shared/types/api'

// ─── Error class ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── Base fetch ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })

  if (!res.ok) {
    let code = 'UNKNOWN_ERROR'
    let message = `Request failed with status ${res.status}`
    try {
      const body = (await res.json()) as ApiErrorResponse
      code = body.error.code
      message = body.error.message
    } catch {
      // response body wasn't JSON — keep defaults
    }
    throw new ApiError(code, message, res.status)
  }

  return res.json() as Promise<T>
}

// ─── Agents ─────────────────────────────────────────────────────────────────

/**
 * GET /api/agents
 * Returns all agents registered in the system.
 */
export async function listAgents(): Promise<Agent[]> {
  const data = await apiFetch<ListAgentsResponse>('/api/agents')
  return data.agents
}

/**
 * GET /api/agents/:agentId
 * Returns a single agent by ID.
 */
export async function getAgent(agentId: string): Promise<Agent> {
  const data = await apiFetch<{ agent: Agent }>(`/api/agents/${agentId}`)
  return data.agent
}

/**
 * POST /api/agents/:agentId/run
 * Runs the agent against a market and returns the generated trace + optional position.
 */
export async function runAgent(
  agentId: string,
  request: RunAgentRequest,
): Promise<RunAgentResponse> {
  return apiFetch<RunAgentResponse>(`/api/agents/${agentId}/run`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

// ─── Traces ─────────────────────────────────────────────────────────────────

/**
 * GET /api/traces?agentId=&assetSymbol=&limit=&cursor=
 */
export async function listTraces(params?: {
  agentId?: string
  assetSymbol?: string
  limit?: number
  cursor?: string
}): Promise<{ traces: ReasoningTrace[]; nextCursor?: string }> {
  const qs = new URLSearchParams()
  if (params?.agentId) qs.set('agentId', params.agentId)
  if (params?.assetSymbol) qs.set('assetSymbol', params.assetSymbol)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.cursor) qs.set('cursor', params.cursor)

  const query = qs.toString() ? `?${qs.toString()}` : ''
  const data = await apiFetch<ListTracesResponse>(`/api/traces${query}`)
  return { traces: data.traces, nextCursor: data.nextCursor }
}

/**
 * GET /api/traces/:traceId
 */
export async function getTrace(traceId: string): Promise<ReasoningTrace> {
  const data = await apiFetch<GetTraceResponse>(`/api/traces/${traceId}`)
  return data.trace
}


// ─── Positions ───────────────────────────────────────────────────────────────

/**
 * GET /api/positions?agentId=&isOpen=
 */
export async function listPositions(params?: {
  agentId?: string
  isOpen?: boolean
}): Promise<Position[]> {
  const qs = new URLSearchParams()
  if (params?.agentId) qs.set('agentId', params.agentId)
  if (params?.isOpen !== undefined) qs.set('isOpen', String(params.isOpen))

  const query = qs.toString() ? `?${qs.toString()}` : ''
  const data = await apiFetch<{ positions: Position[] }>(`/api/positions${query}`)
  return data.positions
}

export async function syncPositions(): Promise<Position[]> {
  const data = await apiFetch<{ positions: Position[] }>('/api/positions', { method: 'POST' })
  return data.positions
}

export async function getMarketSnapshot(symbol: string): Promise<MarketSnapshot | null> {
  const qs = new URLSearchParams({ symbol })
  const data = await apiFetch<GetMarketSnapshotResponse>(`/api/markets/snapshot?${qs.toString()}`)
  return data.snapshot
}

export async function getCctpQuote(request: CctpQuoteRequest): Promise<CctpQuoteResponse> {
  return apiFetch<CctpQuoteResponse>('/api/bridge/cctp/quote', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export async function submitCctpTransfer(request: CctpTransferRequest): Promise<CctpTransferResponse> {
  return apiFetch<CctpTransferResponse>('/api/bridge/cctp/transfer', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

// ─── Re-exports for convenience ──────────────────────────────────────────────

export type {
  Agent,
  ReasoningTrace,
  Position,
  MarketSnapshot,
  RunAgentRequest,
  RunAgentResponse,
  CctpQuoteRequest,
  CctpQuoteResponse,
  CctpTransferRequest,
  CctpTransferResponse,
}
