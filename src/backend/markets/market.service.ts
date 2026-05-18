import { VestigeError } from "../shared/errors";
import type { MarketDataService, MarketSnapshot } from "./market.types";

export type { MarketDataService, MarketSnapshot } from "./market.types";

const COINBASE_BASE_URL = "https://api.exchange.coinbase.com";
const PRODUCT_OVERRIDES: Record<string, string> = {
  BTC: "BTC-USD",
  ETH: "ETH-USD",
  SOL: "SOL-USD",
  XRP: "XRP-USD",
  AVAX: "AVAX-USD",
  LINK: "LINK-USD",
  DOGE: "DOGE-USD",
  ADA: "ADA-USD",
  MATIC: "MATIC-USD",
  POL: "POL-USD",
  OP: "OP-USD",
  ARB: "ARB-USD",
};

interface CoinbaseTicker {
  price?: string;
  volume?: string;
  time?: string;
}

interface CoinbaseStats {
  high?: string;
  low?: string;
  open?: string;
  volume?: string;
}

export class CoinbaseMarketDataService implements MarketDataService {
  constructor(private readonly baseUrl = process.env.COINBASE_EXCHANGE_API_URL ?? COINBASE_BASE_URL) {}

  async getSnapshot(symbol: string): Promise<MarketSnapshot | null> {
    const productId = toCoinbaseProductId(symbol);
    const [ticker, stats] = await Promise.all([
      this.fetchJson<CoinbaseTicker>(`/products/${productId}/ticker`),
      this.fetchJson<CoinbaseStats>(`/products/${productId}/stats`).catch(() => null),
    ]);

    const price = Number(ticker.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new VestigeError(`No live Coinbase ticker price for ${productId}.`, "MARKET_PRICE_UNAVAILABLE");
    }

    const open = Number(stats?.open);
    const change24hPercent = Number.isFinite(open) && open > 0
      ? Number((((price - open) / open) * 100).toFixed(2))
      : undefined;

    return {
      symbol: symbol.toUpperCase(),
      baseAsset: productId.split("-")[0],
      quoteAsset: productId.split("-")[1] ?? "USD",
      price,
      source: "coinbase-exchange",
      volume24h: optionalNumber(stats?.volume ?? ticker.volume),
      high24h: optionalNumber(stats?.high),
      low24h: optionalNumber(stats?.low),
      change24hPercent,
      fetchedAt: ticker.time ?? new Date().toISOString(),
    };
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Vestige/1.0",
      },
      next: { revalidate: 20 },
    });

    if (!response.ok) {
      throw new VestigeError(`Market data request failed (${response.status}).`, "MARKET_DATA_FAILED");
    }

    return response.json() as Promise<T>;
  }
}

export function createMarketDataService(): MarketDataService {
  return new CoinbaseMarketDataService();
}

function toCoinbaseProductId(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) throw new VestigeError("Asset symbol is required.", "MARKET_SYMBOL_REQUIRED");
  if (normalized.includes("-")) return normalized;
  if (PRODUCT_OVERRIDES[normalized]) return PRODUCT_OVERRIDES[normalized];
  return `${normalized}-USD`;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}
