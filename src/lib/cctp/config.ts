import { ARC_TESTNET } from "@/lib/arc";
import { CCTP_ARC, CCTP_SOURCE_CHAINS } from "@/backend/bridge/cctp.constants";

export interface CctpBridgeConfig {
  configured: boolean;
  reason?: string;
  apiUrl?: string;
  apiKeyConfigured: boolean;
  apiUrlConfigured: boolean;
  supportedSourceChains: readonly number[];
  destinationChainId: number;
}

export const CCTP_FAST_FINALITY_THRESHOLD = 1000;
export const CCTP_ARC_TESTNET_DOMAIN = CCTP_ARC.domain;

export const SUPPORTED_CCTP_SOURCE_CHAINS = Object.keys(CCTP_SOURCE_CHAINS).map(Number) as Array<keyof typeof CCTP_SOURCE_CHAINS>;

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
    configured: true,
    reason: missing.length > 0
      ? `Managed Circle bridge API unavailable: ${missing.join(", ")}. Self-custody CCTP remains available for injected wallets.`
      : undefined,
    apiUrl,
    apiKeyConfigured,
    apiUrlConfigured: Boolean(apiUrl),
    supportedSourceChains: SUPPORTED_CCTP_SOURCE_CHAINS,
    destinationChainId: ARC_TESTNET.chainId,
  };
}

export function isSupportedCctpSourceChain(chainId: number): boolean {
  return chainId in CCTP_SOURCE_CHAINS;
}

export function cctpChainLabel(chainId: number): string {
  if (chainId === ARC_TESTNET.chainId) return "Arc Testnet";
  return CCTP_SOURCE_CHAINS[chainId as keyof typeof CCTP_SOURCE_CHAINS]?.label ?? `Chain ${chainId}`;
}

export function estimateBridgeCompletionMinutes(chainId: number): string {
  return CCTP_SOURCE_CHAINS[chainId as keyof typeof CCTP_SOURCE_CHAINS]?.eta ?? "10-20 min";
}

export function getCctpSourceChain(chainId: number): typeof CCTP_SOURCE_CHAINS[keyof typeof CCTP_SOURCE_CHAINS] | undefined {
  return CCTP_SOURCE_CHAINS[chainId as keyof typeof CCTP_SOURCE_CHAINS];
}
