import {
  CCTP_ARC,
  CCTP_FORWARDING_HOOK_DATA,
  CCTP_SOURCE_CHAINS,
} from "@/backend/bridge/cctp.constants";

const APPROVE_SELECTOR = "0x095ea7b3";
const DEPOSIT_FOR_BURN_WITH_HOOK_SELECTOR = "0x89a56598";
const USDC_DECIMALS = 6n;

export function buildCctpSourceChainParams(chainId: number) {
  const source = getSource(chainId);
  return {
    chainId: source.chainIdHex,
    chainName: source.label,
    nativeCurrency: source.nativeCurrency,
    rpcUrls: [...source.rpcUrls],
    blockExplorerUrls: [source.explorerUrl],
  };
}

export function sourceUsdcAddress(chainId: number): string {
  return getSource(chainId).usdcAddress;
}

export function sourceTokenMessengerAddress(chainId: number): string {
  return getSource(chainId).tokenMessengerAddress;
}

export function sourceExplorerTxUrl(chainId: number, txHash: string): string {
  return `${getSource(chainId).explorerUrl}/tx/${txHash}`;
}

export function encodeUsdcApproval(chainId: number, amount: string): string {
  return `${APPROVE_SELECTOR}${wordAddress(sourceTokenMessengerAddress(chainId))}${wordUint(usdcToAtomicAmount(amount))}`;
}

export function encodeCctpBurnWithHook(input: {
  sourceChainId: number;
  amount: string;
  mintRecipient: string;
}): string {
  const source = getSource(input.sourceChainId);
  const hookData = normalizeHex(CCTP_FORWARDING_HOOK_DATA);
  return [
    DEPOSIT_FOR_BURN_WITH_HOOK_SELECTOR,
    wordUint(usdcToAtomicAmount(input.amount)),
    wordUint(BigInt(CCTP_ARC.domain)),
    wordBytes32Address(input.mintRecipient),
    wordAddress(source.usdcAddress),
    wordBytes32Address(input.mintRecipient),
    wordUint(0n),
    wordUint(1000n),
    wordUint(32n * 8n),
    wordUint(BigInt((hookData.length - 2) / 2)),
    hookData.slice(2).padEnd(Math.ceil((hookData.length - 2) / 64) * 64, "0"),
  ].join("");
}

function getSource(chainId: number): typeof CCTP_SOURCE_CHAINS[keyof typeof CCTP_SOURCE_CHAINS] {
  const source = CCTP_SOURCE_CHAINS[chainId as keyof typeof CCTP_SOURCE_CHAINS];
  if (!source) throw new Error("Unsupported CCTP source chain.");
  return source;
}

function usdcToAtomicAmount(amount: string): bigint {
  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 0n;
  const [whole, fraction = ""] = normalized.split(".");
  const atomic = `${whole}${fraction.padEnd(Number(USDC_DECIMALS), "0").slice(0, Number(USDC_DECIMALS))}`.replace(/^0+(?=\d)/, "");
  return BigInt(atomic || "0");
}

function wordUint(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function wordAddress(address: string): string {
  const normalized = normalizeAddress(address);
  return normalized.slice(2).padStart(64, "0");
}

function wordBytes32Address(address: string): string {
  const normalized = normalizeAddress(address);
  return normalized.slice(2).padEnd(64, "0");
}

function normalizeAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) throw new Error("Invalid EVM address.");
  return normalized;
}

function normalizeHex(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Invalid hex data.");
  }
  return normalized;
}
