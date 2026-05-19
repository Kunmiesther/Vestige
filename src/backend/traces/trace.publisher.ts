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
  publisherAddress?: string;
  publisherWalletType?: "circle" | "injected";
  publisherWalletId?: string;
  signature?: string;
  message?: string;
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
      const publishIdentity = normalizePublishIdentity(options);
      const artifact = await this.storageService.publishTracePayload(toPublishedTracePayload(publishing, publishIdentity));
      const verifiedTransaction = await this.chainService.verifyTraceTransaction(options?.txHash);

      const published: ReasoningTrace = {
        ...publishing,
        status: artifact.ipfsCid || artifact.irysId || verifiedTransaction ? "published" : "stored",
        ipfsCid: artifact.ipfsCid,
        irysId: artifact.irysId,
        txHash: verifiedTransaction?.hash ?? options?.txHash,
        publisherAddress: publishIdentity.publisherAddress,
        publisherWalletType: publishIdentity.publisherWalletType,
        publisherWalletId: publishIdentity.publisherWalletId,
        publishSignature: publishIdentity.signature,
        publishMessage: publishIdentity.message,
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

function normalizePublishIdentity(options?: PublishTraceOptions): Required<Pick<PublishTraceOptions, "publisherAddress">> & Omit<PublishTraceOptions, "txHash" | "publisherAddress"> {
  const publisherAddress = options?.publisherAddress?.trim();
  if (!publisherAddress) {
    throw new Error("Wallet publisher address is required to publish a trace.");
  }
  if (!options?.signature?.trim() || !options.message?.trim()) {
    throw new Error("A wallet signature and publish message are required to publish a trace.");
  }

  return {
    publisherAddress,
    publisherWalletType: options?.publisherWalletType,
    publisherWalletId: options?.publisherWalletId?.trim() || undefined,
    signature: options?.signature?.trim() || undefined,
    message: options?.message?.trim() || undefined,
  };
}

function toPublishedTracePayload(
  trace: ReasoningTrace,
  publishIdentity: ReturnType<typeof normalizePublishIdentity>,
): PublishedTracePayload {
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
    publisherAddress: publishIdentity.publisherAddress,
    publisherWalletType: publishIdentity.publisherWalletType,
    publisherWalletId: publishIdentity.publisherWalletId,
    publishSignature: publishIdentity.signature,
    publishMessage: publishIdentity.message,
  };
}
