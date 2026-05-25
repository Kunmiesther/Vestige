import { VestigeError } from "../shared/errors";
import { ARC_TESTNET, ARC_USDC_CONTRACT_ADDRESS } from "@/lib/arc";

const TRANSFER_SELECTOR = "0xa9059cbb";
const TRANSFER_FROM_SELECTOR = "0x23b872dd";
const USDC_DECIMALS = 6n;

export interface ArcTransactionReceipt {
  transactionHash: string;
  status?: string;
  blockNumber?: string;
  from?: string;
  to?: string;
}

interface ArcRpcTransaction {
  hash?: string;
  from?: string;
  to?: string;
  input?: string;
}

interface RpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

export interface UsdcTransferVerification {
  txHash: string;
  payer: string;
  payTo: string;
  amountAtomic: string;
  amount: string;
  network: string;
  receipt: ArcTransactionReceipt;
}

export async function verifyArcUsdcTransfer(input: {
  txHash?: string;
  payer?: string;
  payTo: string;
  amount: string;
  tokenAddress?: string;
}): Promise<UsdcTransferVerification> {
  const txHash = normalizeHash(input.txHash);
  const expectedPayTo = normalizeAddress(input.payTo);
  const expectedToken = normalizeAddress(input.tokenAddress ?? ARC_USDC_CONTRACT_ADDRESS);
  const expectedPayer = normalizeAddress(input.payer);
  const expectedAmount = usdcToAtomicAmount(input.amount);

  if (!txHash) throw new VestigeError("Payment transaction hash is required.", "PAYMENT_TX_REQUIRED");
  if (!expectedPayTo) throw new VestigeError("Payment destination is invalid.", "PAYMENT_DESTINATION_INVALID");
  if (!expectedToken) throw new VestigeError("Payment asset is invalid.", "PAYMENT_ASSET_INVALID");
  if (expectedAmount <= 0n) throw new VestigeError("Payment amount is invalid.", "PAYMENT_AMOUNT_INVALID");

  const chainId = await rpc<string>("eth_chainId", []);
  const numericChainId = Number.parseInt(chainId, 16);
  if (numericChainId !== ARC_TESTNET.chainId) {
    throw new VestigeError(`Configured Arc RPC returned chain ${numericChainId}.`, "ARC_CHAIN_MISMATCH");
  }

  const receipt = await waitForReceipt(txHash);
  if (!receipt) throw new VestigeError("Payment transaction was not found on Arc.", "PAYMENT_TX_NOT_FOUND");
  if (receipt.status && receipt.status !== "0x1") {
    throw new VestigeError("Payment transaction reverted on Arc.", "PAYMENT_TX_REVERTED");
  }

  const tx = await rpc<ArcRpcTransaction | null>("eth_getTransactionByHash", [txHash]);
  if (!tx) throw new VestigeError("Payment transaction details were not found on Arc.", "PAYMENT_TX_NOT_FOUND");

  const from = normalizeAddress(tx.from);
  const to = normalizeAddress(tx.to);
  if (!from) throw new VestigeError("Payment transaction payer is invalid.", "PAYMENT_PAYER_INVALID");
  if (expectedPayer && from !== expectedPayer) {
    throw new VestigeError("Payment transaction was submitted by a different wallet.", "PAYMENT_PAYER_MISMATCH");
  }
  if (to !== expectedToken) {
    throw new VestigeError("Payment transaction did not target Arc USDC.", "PAYMENT_ASSET_MISMATCH");
  }

  const transfer = decodeUsdcTransferInput(tx.input);
  if (!transfer) {
    throw new VestigeError("Payment transaction was not an ERC20 USDC transfer.", "PAYMENT_TX_INVALID");
  }
  if (transfer.to !== expectedPayTo) {
    throw new VestigeError("Payment transaction was sent to the wrong recipient.", "PAYMENT_RECIPIENT_MISMATCH");
  }
  if (transfer.amount < expectedAmount) {
    throw new VestigeError("Payment transaction amount is below the required USDC price.", "PAYMENT_AMOUNT_MISMATCH");
  }

  return {
    txHash,
    payer: from,
    payTo: transfer.to,
    amountAtomic: transfer.amount.toString(),
    amount: atomicUsdcToDecimal(transfer.amount),
    network: `eip155:${ARC_TESTNET.chainId}`,
    receipt,
  };
}

async function waitForReceipt(txHash: string): Promise<ArcTransactionReceipt | null> {
  const attempts = Math.max(1, Number.parseInt(process.env.ARC_TX_CONFIRMATION_ATTEMPTS ?? "10", 10));
  const delayMs = Math.max(250, Number.parseInt(process.env.ARC_TX_CONFIRMATION_DELAY_MS ?? "1500", 10));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const receipt = await rpc<ArcTransactionReceipt | null>("eth_getTransactionReceipt", [txHash]);
    if (receipt) return receipt;
    if (attempt < attempts - 1) await delay(delayMs);
  }
  return null;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = process.env.ARC_RPC_URL ?? process.env.RPC?.trim() ?? ARC_TESTNET.rpcUrl;
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({})) as RpcResponse<T>;
  if (!response.ok || body.error) {
    throw new VestigeError(body.error?.message ?? `Arc RPC request failed (${response.status}).`, "ARC_RPC_FAILED");
  }
  return body.result as T;
}

function decodeUsdcTransferInput(input: string | undefined): { to: string; amount: bigint } | null {
  const normalized = input?.toLowerCase();
  if (!normalized?.startsWith(TRANSFER_SELECTOR) || normalized.length < 138) return null;
  const toWord = normalized.slice(10, 74);
  const amountWord = normalized.slice(74, 138);
  const to = normalizeAddress(`0x${toWord.slice(24)}`);
  if (!to) return null;
  return { to, amount: BigInt(`0x${amountWord}`) };
}

export function usdcToAtomicAmount(amount: string): bigint {
  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 0n;
  const [whole, fraction = ""] = normalized.split(".");
  const atomic = `${whole}${fraction.padEnd(Number(USDC_DECIMALS), "0").slice(0, Number(USDC_DECIMALS))}`.replace(/^0+(?=\d)/, "");
  return BigInt(atomic || "0");
}

export function atomicUsdcToDecimal(value: bigint): string {
  const divisor = 10n ** USDC_DECIMALS;
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === 0n) return `${whole}.00`;
  return `${whole}.${fraction.toString().padStart(Number(USDC_DECIMALS), "0").replace(/0+$/, "")}`;
}

export function encodeErc20Transfer(to: string, amount: string): string {
  const normalizedTo = normalizeAddress(to);
  if (!normalizedTo) throw new Error("USDC transfer recipient is invalid.");
  const atomic = usdcToAtomicAmount(amount);
  if (atomic <= 0n) throw new Error("USDC transfer amount is invalid.");
  return `${TRANSFER_SELECTOR}${normalizedTo.slice(2).padStart(64, "0")}${atomic.toString(16).padStart(64, "0")}`;
}

export function decodeErc20TransferFromInput(input: string | undefined): { from: string; to: string; amount: bigint } | null {
  const normalized = input?.toLowerCase();
  if (!normalized?.startsWith(TRANSFER_FROM_SELECTOR) || normalized.length < 202) return null;
  const from = normalizeAddress(`0x${normalized.slice(10, 74).slice(24)}`);
  const to = normalizeAddress(`0x${normalized.slice(74, 138).slice(24)}`);
  const amount = BigInt(`0x${normalized.slice(138, 202)}`);
  return from && to ? { from, to, amount } : null;
}

export async function verifyArcTransaction(input: {
  txHash?: string;
  from?: string;
  to?: string;
}): Promise<ArcRpcTransaction & { hash: string; receipt: ArcTransactionReceipt }> {
  const txHash = normalizeHash(input.txHash);
  const expectedFrom = normalizeAddress(input.from);
  const expectedTo = normalizeAddress(input.to);

  if (!txHash) throw new VestigeError("Arc transaction hash is required.", "ARC_TX_REQUIRED");

  const chainId = await rpc<string>("eth_chainId", []);
  const numericChainId = Number.parseInt(chainId, 16);
  if (numericChainId !== ARC_TESTNET.chainId) {
    throw new VestigeError(`Configured Arc RPC returned chain ${numericChainId}.`, "ARC_CHAIN_MISMATCH");
  }

  const receipt = await waitForReceipt(txHash);
  if (!receipt) throw new VestigeError("Arc transaction was not found.", "ARC_TX_NOT_FOUND");
  if (receipt.status && receipt.status !== "0x1") {
    throw new VestigeError("Arc transaction reverted.", "ARC_TX_REVERTED");
  }

  const tx = await rpc<ArcRpcTransaction | null>("eth_getTransactionByHash", [txHash]);
  if (!tx) throw new VestigeError("Arc transaction details were not found.", "ARC_TX_NOT_FOUND");

  const from = normalizeAddress(tx.from);
  const to = normalizeAddress(tx.to);
  if (expectedFrom && from !== expectedFrom) {
    throw new VestigeError("Arc transaction was submitted by a different wallet.", "ARC_TX_FROM_MISMATCH");
  }
  if (expectedTo && to !== expectedTo) {
    throw new VestigeError("Arc transaction was sent to a different recipient.", "ARC_TX_TO_MISMATCH");
  }

  return {
    ...tx,
    hash: txHash,
    receipt,
  };
}

function normalizeHash(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^0x[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeAddress(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && /^0x[a-f0-9]{40}$/.test(trimmed) ? trimmed : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
