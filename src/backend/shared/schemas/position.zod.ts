import { z } from "zod";
import { positionSideSchema } from "./trace.zod";

export const positionSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  traceId: z.string().uuid(),
  assetSymbol: z.string(),
  side: positionSideSchema,
  entryPrice: z.number().optional(),
  currentPrice: z.number().optional(),
  targetPrice: z.number().optional(),
  stopLoss: z.number().optional(),
  openedAt: z.string(),
  closedAt: z.string().optional(),
  pnlPercent: z.number().optional(),
  isOpen: z.boolean(),
});

export type PositionSchema = z.infer<typeof positionSchema>;
