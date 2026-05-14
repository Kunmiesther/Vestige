import type { Agent } from "../shared/types/agent";
import type { Position } from "../shared/types/position";
import type { ReasoningTrace } from "../shared/types/trace";

export interface VestigeMockStore {
  agents: Map<string, Agent>;
  traces: Map<string, ReasoningTrace>;
  positions: Map<string, Position>;
}

const globalStore = globalThis as typeof globalThis & {
  __vestigeMockStore?: VestigeMockStore;
};

export function getMockStore(): VestigeMockStore {
  globalStore.__vestigeMockStore ??= {
    agents: new Map<string, Agent>(),
    traces: new Map<string, ReasoningTrace>(),
    positions: new Map<string, Position>(),
  };

  return globalStore.__vestigeMockStore;
}
