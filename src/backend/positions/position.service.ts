import { randomUUID } from "node:crypto";
import type { Position } from "../shared/types/position";
import type { ReasoningTrace } from "../shared/types/trace";
import type { TraceRepository } from "../traces/trace.repository";
import { createTraceRepository } from "../traces/trace.repository";

export interface PositionService {
  createFromTrace(trace: ReasoningTrace): Promise<Position | undefined>;
}

export class DefaultPositionService implements PositionService {
  constructor(private readonly repository: TraceRepository = createTraceRepository()) {}

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
}

export function createPositionService(repository?: TraceRepository): PositionService {
  return new DefaultPositionService(repository);
}
