export interface MarketSnapshot {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  source: string;
  sources?: Array<{
    provider: string;
    price: number;
    fetchedAt: string;
  }>;
  consensusPrice?: number;
  validatedAt?: string;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  change24hPercent?: number;
  liquidityUsd?: number;
  volatility24h?: number;
  marketStructure?: string;
  fetchedAt: string;
}

export interface MarketDataService {
  getSnapshot(symbol: string): Promise<MarketSnapshot | null>;
}
