import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyArcUsdcTransfer } from "@/backend/chain/arc-transaction.service";
import { createIrysClient } from "@/backend/storage/irys.client";
import { createIpfsClient } from "@/backend/storage/ipfs.client";
import type { ApiErrorResponse, PublishTraceRequest, PublishTraceResponse } from "@/backend/shared/types/api";
import type { ReasoningTrace, TracePublicationReceipt } from "@/backend/shared/types/trace";
import { hasReceiptForPayment } from "@/backend/traces/trace.access";
import { createTraceRepository } from "@/backend/traces/trace.repository";
import { ARC_PUBLISH_FEE_USDC, ARC_PUBLISH_PAY_TO, ARC_TESTNET } from "@/lib/arc";

interface RouteContext {
  params: Promise<{ traceId: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<PublishTraceResponse | ApiErrorResponse>> {
  try {
    const { traceId } = await context.params;
    const body = await request.json().catch(() => ({})) as Partial<PublishTraceRequest>;
    const publisher = normalizeAddress(body.publisher);
    const signature = normalizeString(body.signature);
    const message = normalizeString(body.message);
    const contentDigest = normalizeString(body.contentDigest);

    if (!publisher) {
      return errorResponse("PUBLISH_WALLET_REQUIRED", "Connect an EVM wallet before publishing this trace.", 400);
    }
    if (!signature || !message) {
      return errorResponse("PUBLISH_SIGNATURE_REQUIRED", "Wallet signature is required before publishing this trace.", 400);
    }
    if (!isContentDigest(contentDigest)) {
      return errorResponse("PUBLISH_DIGEST_INVALID", "Trace publication digest is invalid.", 400);
    }

    const repo = createTraceRepository();
    const trace = await repo.findTrace(traceId);
    if (!trace) {
      return errorResponse("TRACE_NOT_FOUND", "Trace not found.", 404);
    }

    if (requiresUnlockReceipt(trace)) {
      const suppliedReceipt = normalizeString(body.unlockReceiptId) ?? request.headers.get("x-vestige-unlock-receipt");
      const accessReceipt = hasReceiptForPayment(trace, suppliedReceipt, publisher);
      if (!accessReceipt) {
        return errorResponse("TRACE_UNLOCK_REQUIRED", "Unlock this trace before publishing it to Arc.", 403);
      }
    }

    const publishedAt = new Date().toISOString();
    const publicationId = randomUUID();
    const publicationTxHash = normalizeHash(body.publicationTxHash) ?? normalizeHash(request.headers.get("x-vestige-publication-tx-hash"));
    if (!publicationTxHash) {
      return errorResponse("PUBLISH_TX_REQUIRED", "A confirmed Arc transaction hash is required before publishing this trace.", 400);
    }

    const verifiedPublicationTx = await verifyArcUsdcTransfer({
      txHash: publicationTxHash,
      payer: publisher,
      payTo: ARC_PUBLISH_PAY_TO,
      amount: ARC_PUBLISH_FEE_USDC,
    });
    const storagePayload = buildStoragePayload(trace, {
      publicationId,
      publisher,
      signature,
      message,
      contentDigest,
      txHash: verifiedPublicationTx.txHash,
      publishedAt,
    });
    const storage = await publishStorage(storagePayload, contentDigest);
    const receipt: TracePublicationReceipt = {
      publicationId,
      network: `eip155:${ARC_TESTNET.chainId}`,
      publisher,
      amount: verifiedPublicationTx.amount,
      asset: "USDC",
      payTo: verifiedPublicationTx.payTo,
      settlementStatus: "confirmed",
      message,
      signature,
      contentDigest,
      storage: storage.storage,
      irysId: storage.irysId,
      ipfsCid: storage.ipfsCid,
      txHash: verifiedPublicationTx.txHash,
      publishedAt,
    };

    const publicationReceipts = uniquePublicationReceipts([
      ...(trace.publicationReceipts ?? []),
      receipt,
    ]);
    const updatedTrace: ReasoningTrace = {
      ...trace,
      publicationReceipts,
    };

    let persistedTrace = updatedTrace;
    try {
      persistedTrace = await repo.updateTrace(updatedTrace);
    } catch (error) {
      console.warn("[vestige:publish:persist-warning]", {
        traceId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }

    return NextResponse.json({
      trace: {
        ...persistedTrace,
        publicationReceipts,
        locked: false,
      },
      receipt,
    });
  } catch (error) {
    return errorResponse(
      "TRACE_PUBLISH_FAILED",
      error instanceof Error ? error.message : "Failed to publish trace.",
      500,
    );
  }
}

function errorResponse(code: string, message: string, status: number): NextResponse<ApiErrorResponse> {
  return NextResponse.json({ error: { code, message } }, { status });
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeAddress(value: unknown): string | undefined {
  const normalized = normalizeString(value)?.toLowerCase();
  return normalized && /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : undefined;
}

function normalizeHash(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  return normalized && /^0x[0-9a-fA-F]{64}$/.test(normalized) ? normalized : undefined;
}

function isContentDigest(value: string | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value));
}

function requiresUnlockReceipt(trace: ReasoningTrace): boolean {
  return Boolean(trace.premium || (trace.accessTier && trace.accessTier !== "public"));
}

function buildStoragePayload(
  trace: ReasoningTrace,
  publication: Pick<TracePublicationReceipt, "publicationId" | "publisher" | "signature" | "message" | "contentDigest" | "txHash" | "publishedAt">,
): Record<string, unknown> {
  return {
    protocol: "vestige.trace.publication",
    version: 1,
    network: `eip155:${ARC_TESTNET.chainId}`,
    publication,
    trace: {
      id: trace.id,
      agentId: trace.agentId,
      builderId: trace.builderId,
      market: trace.market,
      assetSymbol: trace.assetSymbol,
      thesis: trace.thesis,
      reasoningSteps: trace.reasoningSteps,
      risks: trace.risks,
      catalysts: trace.catalysts,
      confidence: trace.confidence,
      positionIntent: trace.positionIntent,
      verdict: trace.verdict,
      createdAt: trace.createdAt,
    },
  };
}

async function publishStorage(payload: Record<string, unknown>, contentDigest: string): Promise<{
  storage: TracePublicationReceipt["storage"];
  irysId?: string;
  ipfsCid?: string;
}> {
  const irys = createIrysClient();
  const ipfs = createIpfsClient();

  try {
    const irysId = await withTimeout(irys.uploadJson(payload, contentDigest), 8000);
    if (irysId) return { storage: "irys", irysId };
  } catch (error) {
    console.warn("[vestige:publish:irys-warning]", error instanceof Error ? error.message : error);
  }

  try {
    const ipfsCid = await withTimeout(ipfs.addJson(payload, contentDigest), 8000);
    if (ipfsCid) return { storage: "ipfs", ipfsCid };
  } catch (error) {
    console.warn("[vestige:publish:ipfs-warning]", error instanceof Error ? error.message : error);
  }

  return { storage: "local" };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Trace publication storage timed out.")), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

function uniquePublicationReceipts(receipts: TracePublicationReceipt[]): TracePublicationReceipt[] {
  const seen = new Set<string>();
  return receipts.filter((receipt) => {
    const key = receipt.txHash || receipt.publicationId || receipt.contentDigest || receipt.publishedAt;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
