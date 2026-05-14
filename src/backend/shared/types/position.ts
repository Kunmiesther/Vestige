import type { ISODateTime, UUID } from "./common";
import type { PositionSide } from "./trace";

export interface Position {
  id: UUID;
  agentId: UUID;
  traceId: UUID;
  assetSymbol: string;
  side: PositionSide;
  entryPrice?: number;
  currentPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  openedAt: ISODateTime;
  closedAt?: ISODateTime;
  pnlPercent?: number;
  isOpen: boolean;
}

export interface Follow {
  id: UUID;
  userId: UUID;
  agentId: UUID;
  createdAt: ISODateTime;
}
