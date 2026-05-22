import { z } from "zod";
import { VestigeError } from "../shared/errors";
import type {
  CctpQuoteRequest,
  CctpQuoteResponse,
  CctpTransferRequest,
  CctpTransferResponse,
} from "../shared/types/api";
import { getCctpBridgeConfig, isSupportedCctpSourceChain } from "@/lib/cctp/config";

const cctpRequestSchema = z.object({
  fromChainId: z.number().int().positive(),
  toChainId: z.number().int().positive(),
  amount: z.string().min(1),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  walletId: z.string().optional(),
});

const cctpTransferSchema = cctpRequestSchema.extend({
  quoteId: z.string().optional(),
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
    this.requireConfigured();
    validateSupportedRoute(validated.fromChainId, validated.toChainId);
    return this.post<CctpQuoteResponse>("/quote", validated);
  }

  async transfer(input: CctpTransferRequest): Promise<CctpTransferResponse> {
    const validated = cctpTransferSchema.parse(input);
    this.requireConfigured();
    validateSupportedRoute(validated.fromChainId, validated.toChainId);

    if (!validated.walletId) {
      throw new VestigeError("Circle wallet id is required to submit a CCTP transfer.", "CCTP_WALLET_REQUIRED");
    }

    return this.post<CctpTransferResponse>("/transfer", validated);
  }

  private requireConfigured(): void {
    const config = getCctpBridgeConfig();
    if (!this.apiKey || !this.bridgeApiUrl || !config.configured) {
      throw new VestigeError(
        `${config.reason ?? "CCTP bridge is not configured."} Set CIRCLE_API_KEY and CCTP_BRIDGE_API_URL before enabling live bridge transfers.`,
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
