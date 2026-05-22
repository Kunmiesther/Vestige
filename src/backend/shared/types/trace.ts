import type { ISODateTime, UUID } from "./common";

export type TraceStatus = "draft" | "stored" | "failed";
export type PositionSide = "long" | "short" | "neutral";
export type ConfidenceLevel = "low" | "medium" | "high";
export type TimeHorizon = "intraday" | "swing" | "long-term";
export type VerdictAction =
  | "AVOID EXPOSURE"
  | "DEFENSIVE POSITIONING"
  | "RANGE CONDITIONS"
  | "ACCUMULATION BIAS"
  | "HIGH-CONVICTION EXPANSION";
export type TraceAccessTier = "public" | "premium" | "institutional";

export interface TracePaymentReceipt {
  receiptId: string;
  protocol: "x402";
  amount: string;
  asset: "USDC";
  network: string;
  payer?: string;
  payTo?: string;
  txHash?: string;
  facilitatorReference?: string;
  unlockedAt: ISODateTime;
}

export interface TraceIntelligenceMetrics {
  marketRegime?: string;
  liquidityState?: string;
  volatilityState?: string;
  alignment?: number;
  pressure?: number;
  catalystStrength?: number;
  disagreement?: number;
  convictionTemperature?: string;
}

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
  accessTier?: TraceAccessTier;
  unlockPriceUsdc?: string;
  unlockCount?: number;
  demandScore?: number;
  paymentReceipts?: TracePaymentReceipt[];
  traceMetrics?: TraceIntelligenceMetrics;
  createdAt: ISODateTime;
}
