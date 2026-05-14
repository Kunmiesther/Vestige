import { z } from "zod";

export const agentStatusSchema = z.enum(["active", "paused", "archived"]);
export const agentModelSchema = z.enum(["deepseek-r1"]);

export const createAgentInputSchema = z.object({
  builderId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
});

export const agentSchema = createAgentInputSchema.extend({
  id: z.string().uuid(),
  slug: z.string().min(1),
  model: agentModelSchema,
  status: agentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentSchema = z.infer<typeof agentSchema>;
export type CreateAgentInputSchema = z.infer<typeof createAgentInputSchema>;
