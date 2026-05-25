import { z } from "zod";

export const positionSideSchema = z.enum(["long", "short", "neutral"]);
export const confidenceLevelSchema = z.enum(["low", "medium", "high"]);
export const timeHorizonSchema = z.enum(["intraday", "swing", "long-term"]);
export const traceStatusSchema = z.enum(["draft", "stored", "failed"]);
export const verdictActionSchema = z.enum([
  "Momentum Favors Continuation",
  "Structure Weakening",
  "Conviction Divergence",
  "Liquidity Trap Risk",
  "Expansion Setup",
  "Fragile Breakout",
  "High Beta Rotation",
  "Regime Shift Watch",
]);
export const traceAccessTierSchema = z.enum(["public", "premium", "institutional"]);

export const tracePaymentReceiptSchema = z.object({
  receiptId: z.string(),
  protocol: z.literal("x402"),
  amount: z.string(),
  asset: z.literal("USDC"),
  network: z.string(),
  settlementStatus: z.enum(["submitted", "confirmed", "failed"]).optional(),
  payer: z.string().optional(),
  payTo: z.string().optional(),
  txHash: z.string().optional(),
  facilitatorReference: z.string().optional(),
  unlockedAt: z.string(),
});

export const tracePublicationReceiptSchema = z.object({
  publicationId: z.string(),
  network: z.string(),
  publisher: z.string(),
  amount: z.string().optional(),
  asset: z.literal("USDC").optional(),
  payTo: z.string().optional(),
  settlementStatus: z.enum(["submitted", "confirmed", "failed"]).optional(),
  message: z.string(),
  signature: z.string(),
  contentDigest: z.string(),
  storage: z.enum(["irys", "ipfs", "local"]),
  irysId: z.string().optional(),
  ipfsCid: z.string().optional(),
  txHash: z.string().optional(),
  publishedAt: z.string(),
});

export const traceIntelligenceMetricsSchema = z.object({
  marketRegime: z.string().optional(),
  liquidityState: z.string().optional(),
  volatilityState: z.string().optional(),
  alignment: z.number().min(0).max(1).optional(),
  pressure: z.number().min(0).max(1).optional(),
  catalystStrength: z.number().min(0).max(1).optional(),
  disagreement: z.number().min(0).max(1).optional(),
  convictionTemperature: z.string().optional(),
});

export const reasoningStepSchema = z.object({
  order: z.number().int().nonnegative(),
  title: z.string(),
  observation: z.string(),
  inference: z.string(),
  evidence: z.array(z.string()).optional(),
});

export const positionIntentSchema = z.object({
  side: positionSideSchema,
  entry: z.number().optional(),
  target: z.number().optional(),
  stopLoss: z.number().optional(),
  timeHorizon: timeHorizonSchema,
});

export const structuredVerdictSchema = z.object({
  action: verdictActionSchema,
  summary: z.string(),
  confidence: confidenceLevelSchema,
  score: z.number().min(0).max(100),
  primaryDrivers: z.array(z.string()),
  invalidation: z.array(z.string()),
});

export const reasoningTraceSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  builderId: z.string().uuid(),
  market: z.string(),
  assetSymbol: z.string(),
  thesis: z.string(),
  reasoningSteps: z.array(reasoningStepSchema),
  risks: z.array(z.string()),
  catalysts: z.array(z.string()),
  confidence: confidenceLevelSchema,
  positionIntent: positionIntentSchema,
  verdict: structuredVerdictSchema.optional(),
  rawModelOutput: z.string().optional(),
  status: traceStatusSchema,
  premium: z.boolean().optional(),
  accessTier: traceAccessTierSchema.optional(),
  unlockPriceUsdc: z.string().optional(),
  unlockCount: z.number().int().nonnegative().optional(),
  demandScore: z.number().nonnegative().optional(),
  locked: z.boolean().optional(),
  creatorWalletAddress: z.string().optional(),
  paymentReceipts: z.array(tracePaymentReceiptSchema).optional(),
  publicationReceipts: z.array(tracePublicationReceiptSchema).optional(),
  traceMetrics: traceIntelligenceMetricsSchema.optional(),
  createdAt: z.string(),
});

export type ReasoningTraceSchema = z.infer<typeof reasoningTraceSchema>;
