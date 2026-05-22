import { VestigeError } from "../shared/errors";
import type { PaymentChallenge } from "../shared/types/api";
import type { TracePaymentReceipt } from "../shared/types/trace";
import { randomUUID } from "node:crypto";

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
    private readonly network = process.env.X402_NETWORK ?? "arc-testnet",
    private readonly facilitatorUrl = process.env.X402_FACILITATOR_URL,
  ) {}

  async authorize(headers: Headers, resource: string): Promise<PremiumAccessResult> {
    if (!this.payTo) {
      throw new VestigeError(
        "x402 paywall is not configured. Set X402_PAY_TO before marking traces premium.",
        "X402_NOT_CONFIGURED",
      );
    }

    const challenge = this.createChallenge(resource);
    const payment = headers.get("x-payment");
    if (!payment) {
      return {
        allowed: false,
        challenge,
      };
    }

    if (!this.facilitatorUrl) {
      throw new VestigeError(
        "x402 payment was supplied but no facilitator is configured. Set X402_FACILITATOR_URL to verify and settle premium trace payments.",
        "X402_FACILITATOR_NOT_CONFIGURED",
      );
    }

    const verified = await this.verifyWithFacilitator(payment, challenge);
    if (!verified) {
      throw new VestigeError("x402 payment verification failed.", "X402_PAYMENT_REJECTED");
    }

    const settlement = await this.settleWithFacilitator(payment, challenge);
    if (!settlement.settled) {
      throw new VestigeError("x402 payment settlement failed.", "X402_SETTLEMENT_FAILED");
    }

    return {
      allowed: true,
      receipt: {
        receiptId: settlement.receiptId,
        protocol: "x402",
        amount: challenge.amount,
        asset: "USDC",
        network: challenge.network,
        payTo: challenge.payTo,
        payer: settlement.payer,
        txHash: settlement.txHash,
        facilitatorReference: settlement.facilitatorReference,
        unlockedAt: new Date().toISOString(),
      },
    };
  }

  private createChallenge(resource: string): PaymentChallenge {
    return {
      protocol: "x402",
      resource,
      amount: this.amount,
      asset: "USDC",
      network: this.network,
      payTo: this.payTo!,
      description: "Premium Vestige reasoning trace access",
    };
  }

  private async verifyWithFacilitator(payment: string, challenge: PaymentChallenge): Promise<boolean> {
    const payload = await this.postFacilitator<{ valid?: boolean; isValid?: boolean }>("verify", payment, challenge);
    return payload.valid === true || payload.isValid === true;
  }

  private async settleWithFacilitator(payment: string, challenge: PaymentChallenge): Promise<{
    settled: boolean;
    receiptId: string;
    txHash?: string;
    payer?: string;
    facilitatorReference?: string;
  }> {
    const payload = await this.postFacilitator<Record<string, unknown>>("settle", payment, challenge);
    return {
      settled: payload.success === true || payload.settled === true,
      receiptId: stringFromPath(payload, ["receiptId", "receipt.id", "id", "settlementId", "data.id"]) ?? randomUUID(),
      txHash: stringFromPath(payload, ["txHash", "transactionHash", "receipt.transactionHash", "receipt.txHash", "data.txHash"]),
      payer: stringFromPath(payload, ["payer", "from", "sender", "data.payer"]),
      facilitatorReference: stringFromPath(payload, ["reference", "data.reference", "paymentId", "data.paymentId"]),
    };
  }

  private async postFacilitator<T>(path: "verify" | "settle", payment: string, challenge: PaymentChallenge): Promise<T> {
    const response = await fetch(`${this.facilitatorUrl!.replace(/\/$/, "")}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment,
        paymentRequirements: challenge,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new VestigeError(`x402 facilitator ${path} request failed (${response.status}).`, "X402_FACILITATOR_FAILED");
    }

    return payload as T;
  }
}

function stringFromPath(record: Record<string, unknown>, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, record);
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

export function createX402Service(): X402Service {
  return new HeaderX402Service();
}
