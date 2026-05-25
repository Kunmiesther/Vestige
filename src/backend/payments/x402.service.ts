import { randomUUID } from "node:crypto";
import { VestigeError } from "../shared/errors";
import { verifyArcUsdcTransfer } from "../chain/arc-transaction.service";
import { ARC_TESTNET, ARC_USDC_CONTRACT_ADDRESS } from "@/lib/arc";
import type { PaymentChallenge } from "../shared/types/api";
import type { TracePaymentReceipt } from "../shared/types/trace";

export interface PremiumAccessResult {
  allowed: boolean;
  challenge?: PaymentChallenge;
  receipt?: TracePaymentReceipt;
}

export interface X402Service {
  authorize(headers: Headers, resource: string): Promise<PremiumAccessResult>;
}

export class HeaderX402Service implements X402Service {
  constructor(
    private readonly payTo = process.env.X402_PAY_TO,
    private readonly amount = process.env.X402_PREMIUM_TRACE_USDC ?? "0.01",
    private readonly network = process.env.X402_NETWORK ?? `eip155:${ARC_TESTNET.chainId}`,
    private readonly assetAddress = process.env.X402_ASSET_ADDRESS ?? process.env.X402_USDC_ASSET_ADDRESS ?? ARC_USDC_CONTRACT_ADDRESS,
    private readonly maxTimeoutSeconds = Number.parseInt(process.env.X402_MAX_TIMEOUT_SECONDS ?? "604800", 10),
    private readonly assetName = process.env.X402_ASSET_NAME ?? "USD Coin",
    private readonly assetVersion = process.env.X402_ASSET_VERSION ?? "2",
  ) {}

  async authorize(headers: Headers, resource: string): Promise<PremiumAccessResult> {
    if (!this.payTo) {
      throw new VestigeError(
        "x402 paywall is not configured. Set X402_PAY_TO before marking traces premium.",
        "X402_NOT_CONFIGURED",
      );
    }

    const challenge = this.createChallenge(resource);
    const suppliedTxHash = normalizeHash(headers.get("x-vestige-unlock-receipt"));
    const walletAddress = headers.get("x-vestige-wallet-address") ?? undefined;

    if (!suppliedTxHash) {
      logX402("challenge-created", {
        resource,
        network: challenge.network,
        amount: challenge.amount,
        payTo: challenge.payTo,
        assetAddress: challenge.assetAddress,
      });
      return { allowed: false, challenge };
    }

    logX402("payment-verification-started", {
      resource,
      network: challenge.network,
      amount: challenge.amount,
      payTo: challenge.payTo,
      txHash: suppliedTxHash,
      walletAddress,
    });

    const verification = await verifyArcUsdcTransfer({
      txHash: suppliedTxHash,
      payer: walletAddress,
      payTo: challenge.payTo,
      amount: challenge.amount,
      tokenAddress: challenge.assetAddress,
    });

    logX402("payment-verified", {
      resource,
      txHash: verification.txHash,
      payer: verification.payer,
      amount: verification.amount,
      payTo: verification.payTo,
    });

    return {
      allowed: true,
      receipt: {
        receiptId: verification.txHash,
        protocol: "x402",
        amount: verification.amount,
        asset: "USDC",
        network: verification.network,
        payTo: verification.payTo,
        payer: verification.payer,
        txHash: verification.txHash,
        settlementStatus: "confirmed",
        unlockedAt: new Date().toISOString(),
      },
    };
  }

  private createChallenge(resource: string): PaymentChallenge {
    const maxTimeoutSeconds = Number.isFinite(this.maxTimeoutSeconds) && this.maxTimeoutSeconds > 0
      ? this.maxTimeoutSeconds
      : 300;

    return {
      protocol: "x402",
      x402Version: 2,
      scheme: "exact",
      resource,
      amount: this.amount,
      asset: "USDC",
      assetAddress: this.assetAddress,
      maxAmountRequired: usdcToAtomicAmount(this.amount),
      maxTimeoutSeconds,
      network: normalizeX402Network(this.network),
      payTo: this.payTo!,
      description: "Premium Vestige reasoning trace access",
      mimeType: "application/json",
      extra: {
        name: this.assetName,
        version: this.assetVersion,
      },
    };
  }
}

function usdcToAtomicAmount(amount: string): string {
  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return "0";
  const [whole, fraction = ""] = normalized.split(".");
  const atomic = `${whole}${fraction.padEnd(6, "0").slice(0, 6)}`.replace(/^0+(?=\d)/, "");
  return atomic || "0";
}

function normalizeX402Network(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "arc-testnet" || normalized === "arc") {
    return `eip155:${ARC_TESTNET.chainId}`;
  }
  if (/^\d+$/.test(normalized)) {
    return `eip155:${normalized}`;
  }
  if (normalized.startsWith("eip155:")) {
    return normalized;
  }
  return value.trim();
}

function normalizeHash(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^0x[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed : undefined;
}

function logX402(event: string, details?: Record<string, unknown>): void {
  console.info("[vestige:x402]", { event, ...details });
}

export function createX402Service(): X402Service {
  return new HeaderX402Service();
}
