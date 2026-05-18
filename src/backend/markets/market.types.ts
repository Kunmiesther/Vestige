export interface MarketSnapshot {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  source: string;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  change24hPercent?: number;
  fetchedAt: string;
}

export interface MarketDataService {
  getSnapshot(symbol: string): Promise<MarketSnapshot | null>;
}
