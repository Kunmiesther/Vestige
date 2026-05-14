import type { ISODateTime, UUID } from "./common";

export type AgentStatus = "active" | "paused" | "archived";
export type AgentModel = "deepseek-r1";

export interface Agent {
  id: UUID;
  builderId: UUID;
  name: string;
  slug: string;
  description?: string;
  model: AgentModel;
  status: AgentStatus;
  systemPrompt: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CreateAgentInput {
  builderId: UUID;
  name: string;
  description?: string;
  systemPrompt: string;
}
