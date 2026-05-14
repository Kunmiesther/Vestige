import type { ISODateTime, UUID } from "./common";

export type TraceStatus = "draft" | "stored" | "pinned" | "failed";
export type PositionSide = "long" | "short" | "neutral";
export type ConfidenceLevel = "low" | "medium" | "high";
export type TimeHorizon = "intraday" | "swing" | "long-term";

export interface ReasoningStep {
  order: number;
  title: string;
  observation: string;
  inference: string;
  evidence?: string[];
}

export interface PositionIntent {
  side: PositionSide;
  entry?: number;
  target?: number;
  stopLoss?: number;
  timeHorizon: TimeHorizon;
}

export interface ReasoningTrace {
  id: UUID;
  agentId: UUID;
  builderId: UUID;
  market: string;
  assetSymbol: string;
  thesis: string;
  reasoningSteps: ReasoningStep[];
  risks: string[];
  catalysts: string[];
  confidence: ConfidenceLevel;
  positionIntent: PositionIntent;
  rawModelOutput?: string;
  status: TraceStatus;
  ipfsCid?: string;
  irysId?: string;
  createdAt: ISODateTime;
  publishedAt?: ISODateTime;
}

export interface PublishedTracePayload {
  protocol: "vestige.trace";
  version: "1.0";
  traceId: UUID;
  agentId: UUID;
  builderId: UUID;
  createdAt: ISODateTime;
  market: string;
  assetSymbol: string;
  thesis: string;
  reasoningSteps: ReasoningStep[];
  risks: string[];
  catalysts: string[];
  confidence: ConfidenceLevel;
  positionIntent: PositionIntent;
}
