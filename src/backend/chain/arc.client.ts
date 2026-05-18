import { ARC_TESTNET } from "@/lib/arc";

export interface ArcClient {
  getChainId(): Promise<number>;
  getTransaction(hash: string): Promise<ArcTransaction | null>;
}

export interface ArcTransaction {
  hash: string;
  blockNumber?: string;
  from?: string;
  to?: string;
  input?: string;
}

interface RpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

export class ArcRpcClient implements ArcClient {
  constructor(private readonly rpcUrl = process.env.ARC_RPC_URL ?? process.env.RPC?.trim() ?? ARC_TESTNET.rpcUrl) {}

  async getChainId(): Promise<number> {
    const result = await this.rpc<string>("eth_chainId", []);
    return Number.parseInt(result, 16);
  }

  async getTransaction(hash: string): Promise<ArcTransaction | null> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
    return this.rpc<ArcTransaction | null>("eth_getTransactionByHash", [hash]);
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
      next: { revalidate: 20 },
    });

    const body = await response.json().catch(() => ({})) as RpcResponse<T>;
    if (!response.ok || body.error) {
      throw new Error(body.error?.message ?? `Arc RPC request failed (${response.status}).`);
    }

    return body.result as T;
  }
}

export function createArcClient(): ArcClient {
  return new ArcRpcClient();
}
