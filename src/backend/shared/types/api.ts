import type { Agent, CreateAgentInput } from "./agent";
import type { AgentPerformanceSnapshot } from "./performance";
import type { Follow, Position } from "./position";
import type { ReasoningTrace, TraceStatus } from "./trace";

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface ListAgentsResponse {
  agents: Agent[];
}

export type CreateAgentRequest = CreateAgentInput;

export interface CreateAgentResponse {
  agent: Agent;
}

export interface RunAgentRequest {
  market: string;
  assetSymbol: string;
  context?: {
    price?: number;
    headlines?: string[];
    marketData?: Record<string, unknown>;
  };
}

export interface RunAgentResponse {
  trace: ReasoningTrace;
  position?: Position;
}

export interface ListTracesQuery {
  agentId?: string;
  assetSymbol?: string;
  limit?: number;
  cursor?: string;
}

export interface ListTracesResponse {
  traces: ReasoningTrace[];
  nextCursor?: string;
}

export interface GetTraceResponse {
  trace: ReasoningTrace;
}

export interface PublishTraceResponse {
  traceId: string;
  ipfsCid?: string;
  irysId?: string;
  status: TraceStatus;
}

export interface ListPositionsQuery {
  agentId?: string;
  isOpen?: boolean;
}

export interface ListPositionsResponse {
  positions: Position[];
}

export interface FollowPositionRequest {
  userId: string;
}

export interface FollowPositionResponse {
  followed: boolean;
  follow?: Follow;
}

export interface GetAgentPerformanceResponse {
  latest: AgentPerformanceSnapshot;
  history: AgentPerformanceSnapshot[];
}
