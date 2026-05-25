import { z } from "zod";
import { VestigeError } from "../shared/errors";
import type {
  CctpQuoteRequest,
  CctpQuoteResponse,
  CctpTransferRequest,
  CctpTransferResponse,
} from "../shared/types/api";
import { getCctpBridgeConfig, isSupportedCctpSourceChain } from "@/lib/cctp/config";
import { CCTP_ARC, CCTP_FORWARDING_HOOK_DATA, CCTP_SOURCE_CHAINS } from "./cctp.constants";

const cctpRequestSchema = z.object({
  fromChainId: z.number().int().positive(),
  toChainId: z.number().int().positive(),
  amount: z.string().min(1),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  walletId: z.string().optional(),
});

const cctpTransferSchema = cctpRequestSchema.extend({
  quoteId: z.string().optional(),
  sourceTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

export interface CctpBridgeService {
  quote(input: CctpQuoteRequest): Promise<CctpQuoteResponse>;
  transfer(input: CctpTransferRequest): Promise<CctpTransferResponse>;
}

export class ConfiguredCctpBridgeService implements CctpBridgeService {
  constructor(
    private readonly apiKey = process.env.CIRCLE_API_KEY,
    private readonly bridgeApiUrl = process.env.CCTP_BRIDGE_API_URL,
  ) {}

  async quote(input: CctpQuoteRequest): Promise<CctpQuoteResponse> {
    const validated = cctpRequestSchema.parse(input);
    validateSupportedRoute(validated.fromChainId, validated.toChainId);
    if (validated.walletAddress && !validated.walletId) {
      const source = CCTP_SOURCE_CHAINS[validated.fromChainId as keyof typeof CCTP_SOURCE_CHAINS];
      return {
        configured: true,
        message: `Use ${source.label} USDC ${source.usdcAddress}; burn on ${source.label}, then relay the attestation to Arc Testnet.`,
        quoteId: `self-custody:${validated.fromChainId}:${Date.now()}`,
      };
    }
    this.requireManagedConfigured();
    return this.post<CctpQuoteResponse>("/quote", validated);
  }

  async transfer(input: CctpTransferRequest): Promise<CctpTransferResponse> {
    const validated = cctpTransferSchema.parse(input);
    validateSupportedRoute(validated.fromChainId, validated.toChainId);

    if (validated.walletAddress && !validated.walletId) {
      if (!validated.sourceTxHash) {
        return {
          configured: true,
          message: `Self-custody burn submitted. Relay with Circle attestation after source finality. Destination domain: ${CCTP_ARC.domain}; hook: ${CCTP_FORWARDING_HOOK_DATA}.`,
          transferId: validated.quoteId,
          status: "pending",
        };
      }
      const message = await fetchCircleMessage(validated.fromChainId, validated.sourceTxHash);
      return {
        configured: true,
        message: message.forwardTxHash
          ? `Bridge completed on Arc: ${message.forwardTxHash}`
          : "Attestation is available. Submit receiveMessage on Arc to complete minting.",
        transferId: message.forwardTxHash ?? validated.sourceTxHash,
        status: message.forwardTxHash ? "completed" : "attesting",
      };
    }

    this.requireManagedConfigured();
    if (!validated.walletId) {
      throw new VestigeError("Circle wallet id is required to submit a CCTP transfer.", "CCTP_WALLET_REQUIRED");
    }

    return this.post<CctpTransferResponse>("/transfer", validated);
  }

  private requireManagedConfigured(): void {
    const config = getCctpBridgeConfig();
    if (!this.apiKey || !this.bridgeApiUrl || !config.apiUrl) {
      throw new VestigeError(
        `${config.reason ?? "Managed Circle bridge API is not configured."} Connect a self-custody wallet or set CIRCLE_API_KEY and CCTP_BRIDGE_API_URL for Circle-managed transfers.`,
        "CCTP_NOT_CONFIGURED",
      );
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const config = getCctpBridgeConfig();
    if (!config.apiUrl) {
      throw new VestigeError("CCTP bridge API URL is invalid.", "CCTP_NOT_CONFIGURED");
    }

    const response = await fetch(`${config.apiUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error?.message === "string"
        ? payload.error.message
        : typeof payload?.message === "string"
          ? payload.message
          : `CCTP bridge upstream request failed (${response.status}).`;
      throw new VestigeError(message, "CCTP_UPSTREAM_FAILED");
    }

    return payload as T;
  }
}

async function fetchCircleMessage(sourceChainId: number, sourceTxHash: string): Promise<{ forwardTxHash?: string }> {
  const source = CCTP_SOURCE_CHAINS[sourceChainId as keyof typeof CCTP_SOURCE_CHAINS];
  const response = await fetch(`https://iris-api-sandbox.circle.com/v2/messages/${source.domain}?transactionHash=${sourceTxHash}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as {
    messages?: Array<{ status?: string; attestation?: string; message?: string; decodedMessage?: { destinationDomain?: string }; forwardTxHash?: string }>;
  };
  if (!response.ok) {
    throw new VestigeError(`Circle attestation request failed (${response.status}).`, "CCTP_ATTESTATION_FAILED");
  }

  const message = payload.messages?.find(item => String(item.decodedMessage?.destinationDomain) === String(CCTP_ARC.domain)) ?? payload.messages?.[0];
  if (!message) throw new VestigeError("Circle attestation is not available yet.", "CCTP_ATTESTATION_PENDING");
  return { forwardTxHash: message.forwardTxHash };
}

export function createCctpBridgeService(): CctpBridgeService {
  return new ConfiguredCctpBridgeService();
}

function validateSupportedRoute(fromChainId: number, toChainId: number): void {
  const config = getCctpBridgeConfig();
  if (!isSupportedCctpSourceChain(fromChainId)) {
    throw new VestigeError("Unsupported CCTP source chain.", "CCTP_UNSUPPORTED_CHAIN");
  }
  if (toChainId !== config.destinationChainId) {
    throw new VestigeError("CCTP destination must be Arc Testnet.", "CCTP_UNSUPPORTED_DESTINATION");
  }
}
