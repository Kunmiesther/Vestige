import type { Agent, CreateAgentInput } from "./agent";
import type { AgentPerformanceSnapshot } from "./performance";
import type { MarketSnapshot } from "../../markets/market.types";
import type { Follow, Position } from "./position";
import type { ReasoningTrace, TracePaymentReceipt, TracePublicationReceipt } from "./trace";

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface ListAgentsResponse {
  agents: Agent[];
}

export type CreateAgentRequest = CreateAgentInput;

export interface CreateAgentResponse {
  agent: Agent;
}

export interface RunAgentRequest {
  market: string;
  assetSymbol: string;
  context?: {
    price?: number;
    headlines?: string[];
    marketSnapshot?: MarketSnapshot;
    marketData?: Record<string, unknown>;
  };
}

export interface RunAgentResponse {
  trace: ReasoningTrace;
  position?: Position;
}

export interface ListTracesQuery {
  agentId?: string;
  assetSymbol?: string;
  limit?: number;
  cursor?: string;
}

export interface ListTracesResponse {
  traces: ReasoningTrace[];
  nextCursor?: string;
}

export interface GetTraceResponse {
  trace: ReasoningTrace;
  receipt?: TracePaymentReceipt;
}

export interface ListPositionsQuery {
  agentId?: string;
  isOpen?: boolean;
}

export interface ListPositionsResponse {
  positions: Position[];
}

export interface GetMarketSnapshotResponse {
  snapshot: MarketSnapshot | null;
}

export interface CctpQuoteRequest {
  fromChainId: number;
  toChainId: number;
  amount: string;
  recipient: string;
  walletAddress?: string;
  tokenAddress?: string;
  walletId?: string;
}

export interface CctpQuoteResponse {
  configured: boolean;
  message: string;
  quoteId?: string;
}

export interface CctpTransferRequest extends CctpQuoteRequest {
  quoteId?: string;
  sourceTxHash?: string;
}

export interface CctpTransferResponse {
  configured: boolean;
  message: string;
  transferId?: string;
  status?: 'queued' | 'submitted' | 'pending' | 'attesting' | 'completed';
}

export interface CctpBridgeStatusResponse {
  configured: boolean;
  reason?: string;
  apiUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  supportedSourceChains: number[];
  destinationChainId: number;
}

export interface PaymentChallenge {
  protocol: 'x402';
  x402Version?: 1 | 2;
  scheme?: 'exact';
  resource: string;
  amount: string;
  asset: 'USDC';
  assetAddress?: string;
  maxAmountRequired?: string;
  maxTimeoutSeconds?: number;
  network: string;
  payTo: string;
  description: string;
  mimeType?: string;
  extra?: {
    name?: string;
    version?: string;
    verifyingContract?: string;
  };
}

export interface TraceEconomyPreview {
  unlockPriceUsdc?: string;
  unlockCount?: number;
  totalUsdcGenerated?: string;
  creatorWalletAddress?: string;
}

export interface PremiumTracePreview {
  id: string;
  market: string;
  assetSymbol: string;
  accessTier?: ReasoningTrace["accessTier"];
  unlockPriceUsdc?: string;
  unlockCount?: number;
  totalUsdcGenerated?: string;
  creatorWalletAddress?: string;
  demandScore?: number;
  createdAt: string;
}

export interface PremiumTracePaymentRequiredResponse {
  paymentRequired: PaymentChallenge;
  tracePreview?: PremiumTracePreview;
}

export interface PremiumTraceResponse extends GetTraceResponse {
  receipt?: TracePaymentReceipt;
}

export interface PublishTraceRequest {
  publisher: string;
  signature: string;
  message: string;
  contentDigest: string;
  publicationTxHash?: string;
  paymentTxHash?: string;
  unlockReceiptId?: string;
}

export interface PublishTraceResponse {
  trace: ReasoningTrace;
  receipt: TracePublicationReceipt;
}

export interface FollowPositionRequest {
  userId: string;
}

export interface FollowPositionResponse {
  followed: boolean;
  follow?: Follow;
}

export interface GetAgentPerformanceResponse {
  latest: AgentPerformanceSnapshot;
  history: AgentPerformanceSnapshot[];
}
