import type { ChainService } from "../chain/chain.service";
import { createChainService } from "../chain/chain.service";
import type { PublishedTracePayload, ReasoningTrace } from "../shared/types/trace";
import type { StorageService } from "../storage/storage.service";
import { createStorageService } from "../storage/storage.service";
import type { TraceRepository } from "./trace.repository";
import { createTraceRepository } from "./trace.repository";

export interface TracePublisher {
  publish(traceId: string, options?: PublishTraceOptions): Promise<ReasoningTrace>;
}

export interface PublishTraceOptions {
  txHash?: string;
}

export class DefaultTracePublisher implements TracePublisher {
  constructor(
    private readonly repository: TraceRepository = createTraceRepository(),
    private readonly storageService: StorageService = createStorageService(),
    private readonly chainService: ChainService = createChainService(),
  ) {}

  async publish(traceId: string, options?: PublishTraceOptions): Promise<ReasoningTrace> {
    const trace = await this.repository.findTrace(traceId);
    if (!trace) throw new Error("Trace not found.");
    if ((trace.status === "published" || trace.status === "pinned") && trace.ipfsCid) return trace;

    const publishing = await this.repository.updateTrace({
      ...trace,
      status: "publishing",
    });

    try {
      const artifact = await this.storageService.publishTracePayload(toPublishedTracePayload(publishing));
      const verifiedTransaction = await this.chainService.verifyTraceTransaction(options?.txHash);

      const published: ReasoningTrace = {
        ...publishing,
        status: artifact.ipfsCid || artifact.irysId || verifiedTransaction ? "published" : "stored",
        ipfsCid: artifact.ipfsCid,
        irysId: artifact.irysId,
        txHash: verifiedTransaction?.hash ?? options?.txHash,
        publishedAt: artifact.ipfsCid || artifact.irysId || verifiedTransaction
          ? new Date().toISOString()
          : undefined,
      };

      return this.repository.updateTrace(published);
    } catch (error) {
      await this.repository.updateTrace({
        ...publishing,
        status: "failed",
      });
      throw error;
    }
  }
}

export function createTracePublisher(repository?: TraceRepository): TracePublisher {
  return new DefaultTracePublisher(repository);
}

function toPublishedTracePayload(trace: ReasoningTrace): PublishedTracePayload {
  return {
    protocol: "vestige.trace",
    version: "1.0",
    traceId: trace.id,
    agentId: trace.agentId,
    builderId: trace.builderId,
    createdAt: trace.createdAt,
    market: trace.market,
    assetSymbol: trace.assetSymbol,
    thesis: trace.thesis,
    reasoningSteps: trace.reasoningSteps,
    risks: trace.risks,
    catalysts: trace.catalysts,
    confidence: trace.confidence,
    positionIntent: trace.positionIntent,
    verdict: trace.verdict,
  };
}
