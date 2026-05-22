import type { ISODateTime, UUID } from "./common";

export type TraceStatus = "draft" | "stored" | "failed";
export type PositionSide = "long" | "short" | "neutral";
export type ConfidenceLevel = "low" | "medium" | "high";
export type TimeHorizon = "intraday" | "swing" | "long-term";
export type VerdictAction =
  | "Aggressive Long"
  | "Tactical Long"
  | "Watchlist Long"
  | "Neutral / Wait"
  | "Tactical Short"
  | "High-Risk Fade"
  | "Conviction Breakdown"
  | "No Clear Edge";

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

export interface StructuredVerdict {
  action: VerdictAction;
  summary: string;
  confidence: ConfidenceLevel;
  score: number;
  primaryDrivers: string[];
  invalidation: string[];
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
  verdict?: StructuredVerdict;
  rawModelOutput?: string;
  status: TraceStatus;
  premium?: boolean;
  createdAt: ISODateTime;
}
