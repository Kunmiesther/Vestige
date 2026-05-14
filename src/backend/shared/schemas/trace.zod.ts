import { z } from "zod";

export const positionSideSchema = z.enum(["long", "short", "neutral"]);
export const confidenceLevelSchema = z.enum(["low", "medium", "high"]);
export const timeHorizonSchema = z.enum(["intraday", "swing", "long-term"]);
export const traceStatusSchema = z.enum(["draft", "stored", "pinned", "failed"]);

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
  rawModelOutput: z.string().optional(),
  status: traceStatusSchema,
  ipfsCid: z.string().optional(),
  irysId: z.string().optional(),
  createdAt: z.string(),
  publishedAt: z.string().optional(),
});

export type ReasoningTraceSchema = z.infer<typeof reasoningTraceSchema>;
