import type { ISODateTime, UUID } from "./common";

export interface AgentPerformanceSnapshot {
  id: UUID;
  agentId: UUID;
  totalPositions: number;
  winRate: number;
  realizedPnlPercent: number;
  unrealizedPnlPercent: number;
  maxDrawdownPercent?: number;
  calculatedAt: ISODateTime;
}
