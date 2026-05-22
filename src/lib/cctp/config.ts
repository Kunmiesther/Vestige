import { ARC_TESTNET } from "@/lib/arc";

export interface CctpBridgeConfig {
  configured: boolean;
  reason?: string;
  apiUrl?: string;
  apiKeyConfigured: boolean;
  apiUrlConfigured: boolean;
  supportedSourceChains: readonly number[];
  destinationChainId: number;
}

export const SUPPORTED_CCTP_SOURCE_CHAINS = [11155111, 84532, 421614] as const;

function normalizeEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeApiUrl(value: string | undefined): string | undefined {
  const normalized = normalizeEnv(value);
  if (!normalized) return undefined;

  try {
    return new URL(normalized).toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function getCctpBridgeConfig(): CctpBridgeConfig {
  const apiKeyConfigured = Boolean(normalizeEnv(process.env.CIRCLE_API_KEY));
  const rawApiUrl = normalizeEnv(process.env.CCTP_BRIDGE_API_URL);
  const apiUrl = normalizeApiUrl(rawApiUrl);
  const missing: string[] = [];

  if (!apiKeyConfigured) missing.push("CIRCLE_API_KEY");
  if (!rawApiUrl) {
    missing.push("CCTP_BRIDGE_API_URL");
  } else if (!apiUrl) {
    missing.push("CCTP_BRIDGE_API_URL (invalid URL)");
  }

  return {
    configured: missing.length === 0,
    reason: missing.length > 0
      ? `Missing configuration: ${missing.join(", ")}`
      : undefined,
    apiUrl,
    apiKeyConfigured,
    apiUrlConfigured: Boolean(apiUrl),
    supportedSourceChains: SUPPORTED_CCTP_SOURCE_CHAINS,
    destinationChainId: ARC_TESTNET.chainId,
  };
}

export function isSupportedCctpSourceChain(chainId: number): boolean {
  return SUPPORTED_CCTP_SOURCE_CHAINS.includes(chainId as typeof SUPPORTED_CCTP_SOURCE_CHAINS[number]);
}

export function cctpChainLabel(chainId: number): string {
  const map: Record<number, string> = {
    11155111: "Ethereum Sepolia",
    84532: "Base Sepolia",
    421614: "Arbitrum Sepolia",
    [ARC_TESTNET.chainId]: "Arc Testnet",
  };
  return map[chainId] ?? `Chain ${chainId}`;
}

export function estimateBridgeCompletionMinutes(chainId: number): string {
  if (chainId === 11155111) return "10-20 min";
  if (chainId === 84532) return "8-15 min";
  if (chainId === 421614) return "10-18 min";
  return "10-20 min";
}
