import { VestigeError } from "../shared/errors";
import { createArcClient, type ArcClient, type ArcTransaction } from "./arc.client";

export interface ChainService {
  verifyTraceTransaction(hash?: string): Promise<ArcTransaction | undefined>;
}

export class ArcChainService implements ChainService {
  constructor(private readonly arcClient: ArcClient = createArcClient()) {}

  async verifyTraceTransaction(hash?: string): Promise<ArcTransaction | undefined> {
    if (!hash) return undefined;

    const chainId = await this.arcClient.getChainId();
    if (chainId !== 5042002) {
      throw new VestigeError(`Configured Arc RPC returned chain ${chainId}.`, "ARC_CHAIN_MISMATCH");
    }

    const transaction = await this.arcClient.getTransaction(hash);
    return transaction ?? undefined;
  }
}

export function createChainService(): ChainService {
  return new ArcChainService();
}
