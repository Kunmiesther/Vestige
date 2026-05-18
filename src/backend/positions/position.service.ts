import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createMarketDataService, type MarketDataService } from "../markets/market.service";
import type { Follow, Position } from "../shared/types/position";
import type { ReasoningTrace } from "../shared/types/trace";
import type { TraceRepository } from "../traces/trace.repository";
import { createTraceRepository } from "../traces/trace.repository";

export interface PositionService {
  createFromTrace(trace: ReasoningTrace): Promise<Position | undefined>;
  list(query?: { agentId?: string; isOpen?: boolean }): Promise<Position[]>;
  get(positionId: string): Promise<Position | null>;
  follow(positionId: string, userId: string): Promise<Follow>;
  syncOpenPrices(): Promise<Position[]>;
}

export class DefaultPositionService implements PositionService {
  constructor(
    private readonly repository: TraceRepository = createTraceRepository(),
    private readonly marketDataService: MarketDataService = createMarketDataService(),
  ) {}

  async createFromTrace(trace: ReasoningTrace): Promise<Position | undefined> {
    const { positionIntent } = trace;

    if (positionIntent.side === "neutral") {
      return undefined;
    }

    const now = new Date().toISOString();
    const position: Position = {
      id: randomUUID(),
      agentId: trace.agentId,
      traceId: trace.id,
      assetSymbol: trace.assetSymbol,
      side: positionIntent.side,
      entryPrice: positionIntent.entry,
      currentPrice: positionIntent.entry,
      targetPrice: positionIntent.target,
      stopLoss: positionIntent.stopLoss,
      openedAt: now,
      isOpen: true,
    };

    return this.repository.createPosition(position);
  }

  async list(query?: { agentId?: string; isOpen?: boolean }): Promise<Position[]> {
    return this.repository.listPositions(query);
  }

  async get(positionId: string): Promise<Position | null> {
    return this.repository.findPosition(positionId);
  }

  async follow(positionId: string, userId: string): Promise<Follow> {
    const validatedUserId = z.string().uuid().parse(userId);
    const position = await this.repository.findPosition(positionId);
    if (!position) throw new Error("Position not found.");

    return this.repository.followPosition({
      id: randomUUID(),
      userId: validatedUserId,
      agentId: position.agentId,
      positionId,
      createdAt: new Date().toISOString(),
    });
  }

  async syncOpenPrices(): Promise<Position[]> {
    const openPositions = await this.repository.listPositions({ isOpen: true });
    const synced = await Promise.all(openPositions.map(async (position) => {
      const snapshot = await this.marketDataService.getSnapshot(position.assetSymbol).catch(() => null);
      if (!snapshot) return position;

      const pnlPercent = computePnlPercent(position, snapshot.price);
      return this.repository.updatePosition({
        ...position,
        currentPrice: snapshot.price,
        pnlPercent,
      });
    }));

    return synced;
  }
}

export function createPositionService(repository?: TraceRepository): PositionService {
  return new DefaultPositionService(repository);
}

function computePnlPercent(position: Position, currentPrice: number): number | undefined {
  if (!position.entryPrice || position.entryPrice <= 0) return undefined;
  const raw = position.side === "short"
    ? ((position.entryPrice - currentPrice) / position.entryPrice) * 100
    : ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  return Number(raw.toFixed(2));
}
