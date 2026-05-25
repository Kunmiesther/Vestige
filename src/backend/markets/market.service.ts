import { VestigeError } from "../shared/errors";
import type { MarketDataService, MarketSnapshot } from "./market.types";

export type { MarketDataService, MarketSnapshot } from "./market.types";

const COINBASE_BASE_URL = "https://api.exchange.coinbase.com";
const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const BIRDEYE_BASE_URL = "https://public-api.birdeye.so";
const CMC_BASE_URL = "https://pro-api.coinmarketcap.com";
const FRESHNESS_MS = 5 * 60 * 1000;
const MAX_SOURCE_DEVIATION = 0.15;
const CACHE_TTL_MS = readPositiveInt(process.env.MARKET_SNAPSHOT_CACHE_TTL_MS, 5 * 60 * 1000);

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOGE: "dogecoin",
  ADA: "cardano",
  MATIC: "matic-network",
  POL: "polygon-ecosystem-token",
  OP: "optimism",
  ARB: "arbitrum",
};

const BIRDEYE_SOLANA_ADDRESSES: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  BTC: "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
  ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKjWjJkk6cs",
};

interface SourceQuote {
  provider: string;
  price: number;
  fetchedAt: string;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  change24hPercent?: number;
  liquidityUsd?: number;
  quoteAsset?: string;
}

interface CacheEntry {
  snapshot: MarketSnapshot;
  cachedAt: number;
}

const snapshotCache = new Map<string, CacheEntry>();
const inFlightSnapshots = new Map<string, Promise<MarketSnapshot>>();

export class CompositeMarketDataService implements MarketDataService {
  constructor(
    private readonly coingeckoBaseUrl = process.env.COINGECKO_API_URL ?? COINGECKO_BASE_URL,
    private readonly birdeyeBaseUrl = process.env.BIRDEYE_API_URL ?? BIRDEYE_BASE_URL,
    private readonly cmcBaseUrl = process.env.COINMARKETCAP_API_URL ?? CMC_BASE_URL,
  ) {}

  async getSnapshot(symbol: string): Promise<MarketSnapshot> {
    const normalized = normalizeSymbol(symbol);
    const cached = getFreshCachedSnapshot(normalized);
    if (cached) return cached;

    const inFlight = inFlightSnapshots.get(normalized);
    if (inFlight) return inFlight;

    const request = this.fetchValidatedSnapshot(normalized)
      .finally(() => {
        inFlightSnapshots.delete(normalized);
      });
    inFlightSnapshots.set(normalized, request);
    return request;
  }

  private async fetchValidatedSnapshot(normalized: string): Promise<MarketSnapshot> {
    const now = Date.now();
    const settled = await Promise.allSettled([
      this.fetchBirdeye(normalized),
      this.fetchCoinGecko(normalized),
      this.fetchCoinMarketCap(normalized),
    ]);

    const quotes = settled
      .flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
      .filter(isFreshQuote);

    if (quotes.length === 0) {
      const cached = getFreshCachedSnapshot(normalized, now);
      if (cached) return cached;

      throw new VestigeError("Live market data unavailable. Analysis aborted.", "LIVE_MARKET_DATA_UNAVAILABLE");
    }

    const consensusPrice = median(quotes.map((quote) => quote.price));
    const rejected = quotes.filter((quote) => deviation(quote.price, consensusPrice) > MAX_SOURCE_DEVIATION);
    const accepted = quotes.filter((quote) => deviation(quote.price, consensusPrice) <= MAX_SOURCE_DEVIATION);
    if (accepted.length === 0 || accepted.length < Math.min(2, quotes.length)) {
      const logDetails = process.env.NODE_ENV === "production"
        ? { symbol: normalized, consensusPrice, quoteCount: quotes.length, rejectedCount: rejected.length }
        : { symbol: normalized, consensusPrice, quotes, rejected };
      console.error("[vestige:market:validation-failed]", logDetails);
      throw new VestigeError("Live market data unavailable. Analysis aborted.", "LIVE_MARKET_DATA_UNAVAILABLE");
    }

    const primary = pickPrimaryQuote(accepted);
    const snapshot: MarketSnapshot = {
      symbol: normalized,
      baseAsset: normalized,
      quoteAsset: primary.quoteAsset ?? "USD",
      price: Number(primary.price.toFixed(pricePrecision(primary.price))),
      source: accepted.map((quote) => quote.provider).join("+"),
      sources: accepted.map((quote) => ({
        provider: quote.provider,
        price: quote.price,
        fetchedAt: quote.fetchedAt,
      })),
      consensusPrice: Number(consensusPrice.toFixed(pricePrecision(consensusPrice))),
      validatedAt: new Date().toISOString(),
      volume24h: primary.volume24h,
      high24h: primary.high24h,
      low24h: primary.low24h,
      change24hPercent: primary.change24hPercent,
      liquidityUsd: primary.liquidityUsd,
      volatility24h: deriveVolatility24h(primary),
      marketStructure: deriveMarketStructure(primary),
      fetchedAt: newestTimestamp(accepted),
    };

    validateSnapshot(snapshot, normalized);
    snapshotCache.set(normalized, { snapshot, cachedAt: now });
    return snapshot;
  }

  private async fetchCoinGecko(symbol: string): Promise<SourceQuote | null> {
    const id = COINGECKO_IDS[symbol];
    if (!id) return null;
    const url = `${this.coingeckoBaseUrl.replace(/\/$/, "")}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;
    const headers: Record<string, string> = {};
    const apiKey = process.env.COINGECKO_API_KEY?.trim();
    if (apiKey) headers["x-cg-demo-api-key"] = apiKey;
    const body = await fetchJson<Record<string, {
      usd?: number;
      usd_24h_vol?: number;
      usd_24h_change?: number;
      last_updated_at?: number;
    }>>(url, headers);
    const data = body[id];
    if (!data?.usd || data.usd <= 0) return null;
    return {
      provider: "coingecko",
      price: data.usd,
      quoteAsset: "USD",
      volume24h: optionalNumber(data.usd_24h_vol),
      liquidityUsd: optionalNumber(data.usd_24h_vol),
      change24hPercent: optionalNumber(data.usd_24h_change),
      fetchedAt: data.last_updated_at ? new Date(data.last_updated_at * 1000).toISOString() : new Date().toISOString(),
    };
  }

  private async fetchBirdeye(symbol: string): Promise<SourceQuote | null> {
    const apiKey = process.env.BIRDEYE_API_KEY?.trim();
    const address = BIRDEYE_SOLANA_ADDRESSES[symbol];
    if (!apiKey || !address) return null;
    const url = `${this.birdeyeBaseUrl.replace(/\/$/, "")}/defi/price?address=${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
        "x-chain": "solana",
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({})) as { data?: { value?: number; updateUnixTime?: number; liquidity?: number } };
    if (!response.ok || !body.data?.value || body.data.value <= 0) return null;
    return {
      provider: "birdeye",
      price: body.data.value,
      quoteAsset: "USD",
      liquidityUsd: optionalNumber(body.data.liquidity),
      fetchedAt: body.data.updateUnixTime ? new Date(body.data.updateUnixTime * 1000).toISOString() : new Date().toISOString(),
    };
  }

  private async fetchCoinMarketCap(symbol: string): Promise<SourceQuote | null> {
    const apiKey = process.env.COINMARKETCAP_API_KEY?.trim();
    if (!apiKey) return null;
    const url = `${this.cmcBaseUrl.replace(/\/$/, "")}/v2/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbol)}&convert=USD`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-CMC_PRO_API_KEY": apiKey,
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({})) as {
      data?: Record<string, Array<{ quote?: { USD?: { price?: number; volume_24h?: number; percent_change_24h?: number } }; last_updated?: string }>>;
    };
    const first = body.data?.[symbol]?.[0];
    const usd = first?.quote?.USD;
    if (!response.ok || !first || !usd?.price || usd.price <= 0) return null;
    return {
      provider: "coinmarketcap",
      price: usd.price,
      quoteAsset: "USD",
      volume24h: optionalNumber(usd.volume_24h),
      liquidityUsd: optionalNumber(usd.volume_24h),
      change24hPercent: optionalNumber(usd.percent_change_24h),
      fetchedAt: first.last_updated ?? new Date().toISOString(),
    };
  }
}

export function createMarketDataService(): MarketDataService {
  return new CompositeMarketDataService();
}

export function validateMarketSnapshot(snapshot: MarketSnapshot | null | undefined, symbol: string): MarketSnapshot {
  const normalized = normalizeSymbol(symbol);
  if (!snapshot) throw new VestigeError("Live market data unavailable. Analysis aborted.", "LIVE_MARKET_DATA_UNAVAILABLE");
  validateSnapshot(snapshot, normalized);
  return snapshot;
}

function getFreshCachedSnapshot(symbol: string, now = Date.now()): MarketSnapshot | null {
  const cached = snapshotCache.get(symbol);
  if (!cached || now - cached.cachedAt >= CACHE_TTL_MS || !isFreshSnapshot(cached.snapshot)) return null;

  return {
    ...cached.snapshot,
    source: `${cached.snapshot.source}+fresh-cache`,
    validatedAt: new Date().toISOString(),
  };
}

function validateSnapshot(snapshot: MarketSnapshot, symbol: string): void {
  if (snapshot.symbol.toUpperCase() !== symbol) {
    throw new VestigeError("Live market data unavailable. Analysis aborted.", "LIVE_MARKET_DATA_UNAVAILABLE");
  }
  if (!Number.isFinite(snapshot.price) || snapshot.price <= 0) {
    throw new VestigeError("Live market data unavailable. Analysis aborted.", "LIVE_MARKET_DATA_UNAVAILABLE");
  }
  if (!isFreshIso(snapshot.fetchedAt) || (snapshot.validatedAt && !isFreshIso(snapshot.validatedAt))) {
    throw new VestigeError("Live market data unavailable. Analysis aborted.", "LIVE_MARKET_DATA_UNAVAILABLE");
  }
  const sourcePrices = snapshot.sources?.map((source) => source.price).filter((price) => Number.isFinite(price) && price > 0) ?? [];
  const consensus = snapshot.consensusPrice ?? (sourcePrices.length > 0 ? median(sourcePrices) : snapshot.price);
  if (!Number.isFinite(consensus) || consensus <= 0 || deviation(snapshot.price, consensus) > MAX_SOURCE_DEVIATION) {
    throw new VestigeError("Live market data unavailable. Analysis aborted.", "LIVE_MARKET_DATA_UNAVAILABLE");
  }
}

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) throw new VestigeError("Asset symbol is required.", "MARKET_SYMBOL_REQUIRED");
  return normalized;
}

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Vestige/1.0",
      ...headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new VestigeError(`Market data request failed (${response.status}).`, "MARKET_DATA_FAILED");
  }
  return response.json() as Promise<T>;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isFreshQuote(quote: SourceQuote): boolean {
  return Number.isFinite(quote.price) && quote.price > 0 && isFreshIso(quote.fetchedAt);
}

function isFreshSnapshot(snapshot: MarketSnapshot): boolean {
  return isFreshIso(snapshot.fetchedAt) && (!snapshot.validatedAt || isFreshIso(snapshot.validatedAt));
}

function isFreshIso(value: string): boolean {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= FRESHNESS_MS && timestamp <= Date.now() + 60_000;
}

function newestTimestamp(quotes: SourceQuote[]): string {
  const newest = quotes
    .map((quote) => new Date(quote.fetchedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return newest ? new Date(newest).toISOString() : new Date().toISOString();
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function deviation(price: number, reference: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(reference) || reference <= 0) return 1;
  return Math.abs(price - reference) / reference;
}

function pickPrimaryQuote(quotes: SourceQuote[]): SourceQuote {
  return quotes.find((quote) => quote.provider === "birdeye") ??
    quotes.find((quote) => quote.provider === "coingecko") ??
    quotes.find((quote) => quote.provider === "coinmarketcap") ??
    quotes[0];
}

function deriveVolatility24h(quote: SourceQuote): number | undefined {
  if (quote.high24h && quote.low24h && quote.price) {
    return Number((Math.abs(quote.high24h - quote.low24h) / quote.price).toFixed(4));
  }
  if (quote.change24hPercent !== undefined) {
    return Number((Math.abs(quote.change24hPercent) / 100).toFixed(4));
  }
  return undefined;
}

function deriveMarketStructure(quote: SourceQuote): string | undefined {
  const change = quote.change24hPercent;
  const volatility = deriveVolatility24h(quote);
  if (change === undefined && volatility === undefined) return undefined;
  if ((volatility ?? 0) >= 0.08) return "volatile expansion";
  if ((volatility ?? 0) <= 0.015) return "compressed range";
  if ((change ?? 0) >= 2) return "upside momentum";
  if ((change ?? 0) <= -2) return "downside pressure";
  return "two-way consolidation";
}

function pricePrecision(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  return 8;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
