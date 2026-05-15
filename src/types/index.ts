/**
 * Frontend type barrel.
 * All types come from the backend — no duplication.
 * Import from here in UI components.
 */

export type { Agent, AgentStatus, AgentModel, CreateAgentInput } from '@/backend/shared/types/agent'
export type {
  ReasoningTrace,
  ReasoningStep,
  PositionIntent,
  PositionSide,
  ConfidenceLevel,
  TimeHorizon,
  TraceStatus,
  PublishedTracePayload,
} from '@/backend/shared/types/trace'
export type { Position, Follow } from '@/backend/shared/types/position'
export type {
  ApiErrorResponse,
  RunAgentRequest,
  RunAgentResponse,
  ListAgentsResponse,
  ListTracesResponse,
  GetTraceResponse,
} from '@/backend/shared/types/api'
