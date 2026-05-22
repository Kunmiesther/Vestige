import { NextResponse } from "next/server";
import { getCctpBridgeConfig } from "@/lib/cctp/config";
import type { CctpBridgeStatusResponse } from "@/backend/shared/types/api";

export async function GET(): Promise<NextResponse<CctpBridgeStatusResponse>> {
  const config = getCctpBridgeConfig();
  return NextResponse.json({
    configured: config.configured,
    reason: config.reason,
    apiUrlConfigured: config.apiUrlConfigured,
    apiKeyConfigured: config.apiKeyConfigured,
    supportedSourceChains: [...config.supportedSourceChains],
    destinationChainId: config.destinationChainId,
  });
}
