import type { SupabaseAdminClient } from "../db/supabase.admin";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "../db/supabase.admin";
import { getMockStore } from "../db/mock.store";
import { VestigeError } from "../shared/errors";
import type { Agent } from "../shared/types/agent";
import type { Position } from "../shared/types/position";
import type { ReasoningTrace } from "../shared/types/trace";
import type { ListTracesQuery } from "../shared/types/api";

export interface TraceRepository {
  findAgent(agentId: string): Promise<Agent>;
  createTrace(trace: ReasoningTrace): Promise<ReasoningTrace>;
  createPosition(position: Position): Promise<Position>;
  // Extended — used by frontend API routes
  listAgents(): Promise<Agent[]>;
  listTraces(query?: ListTracesQuery): Promise<ReasoningTrace[]>;
  findTrace(traceId: string): Promise<ReasoningTrace | null>;
}

export class SupabaseTraceRepository implements TraceRepository {
  constructor(private readonly supabase: SupabaseAdminClient = createSupabaseAdminClient()) {}

  async findAgent(agentId: string): Promise<Agent> {
    const { data, error } = await this.supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (error || !data) {
      throw new VestigeError(error?.message ?? "Agent not found.", "AGENT_NOT_FOUND");
    }

    return mapAgentRow(data);
  }

  async listAgents(): Promise<Agent[]> {
    const { data, error } = await this.supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new VestigeError(error.message ?? "Failed to list agents.", "LIST_AGENTS_FAILED");
    }

    return (data ?? []).map(mapAgentRow);
  }

  async listTraces(query?: ListTracesQuery): Promise<ReasoningTrace[]> {
    let q = this.supabase
      .from("reasoning_traces")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(query?.limit ?? 50);

    if (query?.agentId) q = q.eq("agent_id", query.agentId);
    if (query?.assetSymbol) q = q.eq("asset_symbol", query.assetSymbol);

    const { data, error } = await q;

    if (error) {
      throw new VestigeError(error.message ?? "Failed to list traces.", "LIST_TRACES_FAILED");
    }

    return (data ?? []).map(mapTraceRow);
  }

  async findTrace(traceId: string): Promise<ReasoningTrace | null> {
    const { data, error } = await this.supabase
      .from("reasoning_traces")
      .select("*")
      .eq("id", traceId)
      .single();

    if (error || !data) return null;
    return mapTraceRow(data);
  }

  async createTrace(trace: ReasoningTrace): Promise<ReasoningTrace> {
    const { data, error } = await this.supabase
      .from("reasoning_traces")
      .insert(toTraceRow(trace))
      .select("*")
      .single();

    if (error || !data) {
      throw new VestigeError(error?.message ?? "Failed to store trace.", "TRACE_STORE_FAILED");
    }

    return mapTraceRow(data);
  }

  async createPosition(position: Position): Promise<Position> {
    const { data, error } = await this.supabase
      .from("positions")
      .insert(toPositionRow(position))
      .select("*")
      .single();

    if (error || !data) {
      throw new VestigeError(error?.message ?? "Failed to store position.", "POSITION_STORE_FAILED");
    }

    return mapPositionRow(data);
  }
}

export class MockTraceRepository implements TraceRepository {
  async findAgent(agentId: string): Promise<Agent> {
    const store = getMockStore();
    const existing = store.agents.get(agentId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const agent: Agent = {
      id: agentId,
      builderId: "00000000-0000-4000-8000-000000000001",
      name: "Vestige Demo Agent",
      slug: "vestige-demo-agent",
      model: "deepseek-r1",
      status: "active",
      systemPrompt:
        "You are a market intelligence agent. Produce disciplined, structured trading reasoning only.",
      createdAt: now,
      updatedAt: now,
    };

    store.agents.set(agentId, agent);
    return agent;
  }

  async listAgents(): Promise<Agent[]> {
    const store = getMockStore();
    const agents = Array.from(store.agents.values());

    // If no agents exist yet, return a default demo agent so the
    // Run Analysis modal always has something to select.
    if (agents.length === 0) {
      const now = new Date().toISOString();
      const demo: Agent = {
        id: "00000000-0000-4000-8000-000000000002",
        builderId: "00000000-0000-4000-8000-000000000001",
        name: "Vestige Demo Agent",
        slug: "vestige-demo-agent",
        model: "deepseek-r1",
        status: "active",
        systemPrompt:
          "You are a market intelligence agent. Produce disciplined, structured trading reasoning only.",
        createdAt: now,
        updatedAt: now,
      };
      store.agents.set(demo.id, demo);
      return [demo];
    }

    return agents.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async listTraces(query?: ListTracesQuery): Promise<ReasoningTrace[]> {
    const store = getMockStore();
    let traces = Array.from(store.traces.values());

    if (query?.agentId) {
      traces = traces.filter((t) => t.agentId === query.agentId);
    }
    if (query?.assetSymbol) {
      traces = traces.filter((t) => t.assetSymbol === query.assetSymbol);
    }

    traces.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return traces.slice(0, query?.limit ?? 50);
  }

  async findTrace(traceId: string): Promise<ReasoningTrace | null> {
    return getMockStore().traces.get(traceId) ?? null;
  }

  async createTrace(trace: ReasoningTrace): Promise<ReasoningTrace> {
    getMockStore().traces.set(trace.id, trace);
    return trace;
  }

  async createPosition(position: Position): Promise<Position> {
    getMockStore().positions.set(position.id, position);
    return position;
  }
}

export function createTraceRepository(): TraceRepository {
  return hasSupabaseAdminConfig()
    ? new SupabaseTraceRepository()
    : new MockTraceRepository();
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapAgentRow(row: Record<string, unknown>): Agent {
  return {
    id: asString(row.id),
    builderId: asString(row.builder_id),
    name: asString(row.name),
    slug: asString(row.slug),
    description: optionalString(row.description),
    model: "deepseek-r1",
    status: asAgentStatus(row.status),
    systemPrompt: asString(row.system_prompt),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapTraceRow(row: Record<string, unknown>): ReasoningTrace {
  return {
    id: asString(row.id),
    agentId: asString(row.agent_id),
    builderId: asString(row.builder_id),
    market: asString(row.market),
    assetSymbol: asString(row.asset_symbol),
    thesis: asString(row.thesis),
    reasoningSteps: asReasoningSteps(row.reasoning_steps),
    risks: asStringArray(row.risks),
    catalysts: asStringArray(row.catalysts),
    confidence: asConfidence(row.confidence),
    positionIntent: asPositionIntent(row.position_intent),
    rawModelOutput: optionalString(row.raw_model_output),
    status: asTraceStatus(row.status),
    ipfsCid: optionalString(row.ipfs_cid),
    irysId: optionalString(row.irys_id),
    createdAt: asString(row.created_at),
    publishedAt: optionalString(row.published_at),
  };
}

function mapPositionRow(row: Record<string, unknown>): Position {
  return {
    id: asString(row.id),
    agentId: asString(row.agent_id),
    traceId: asString(row.trace_id),
    assetSymbol: asString(row.asset_symbol),
    side: asPositionSide(row.side),
    entryPrice: optionalNumber(row.entry_price),
    currentPrice: optionalNumber(row.current_price),
    targetPrice: optionalNumber(row.target_price),
    stopLoss: optionalNumber(row.stop_loss),
    openedAt: asString(row.opened_at),
    closedAt: optionalString(row.closed_at),
    pnlPercent: optionalNumber(row.pnl_percent),
    isOpen: asBoolean(row.is_open),
  };
}

function toTraceRow(trace: ReasoningTrace): Record<string, unknown> {
  return {
    id: trace.id,
    agent_id: trace.agentId,
    builder_id: trace.builderId,
    market: trace.market,
    asset_symbol: trace.assetSymbol,
    thesis: trace.thesis,
    reasoning_steps: trace.reasoningSteps,
    risks: trace.risks,
    catalysts: trace.catalysts,
    confidence: trace.confidence,
    position_intent: trace.positionIntent,
    raw_model_output: trace.rawModelOutput,
    status: trace.status,
    ipfs_cid: trace.ipfsCid,
    irys_id: trace.irysId,
    created_at: trace.createdAt,
    published_at: trace.publishedAt,
  };
}

function toPositionRow(position: Position): Record<string, unknown> {
  return {
    id: position.id,
    agent_id: position.agentId,
    trace_id: position.traceId,
    asset_symbol: position.assetSymbol,
    side: position.side,
    entry_price: position.entryPrice,
    current_price: position.currentPrice,
    target_price: position.targetPrice,
    stop_loss: position.stopLoss,
    opened_at: position.openedAt,
    closed_at: position.closedAt,
    pnl_percent: position.pnlPercent,
    is_open: position.isOpen,
  };
}

// ─── Type guards ──────────────────────────────────────────────────────────────

function asString(value: unknown): string {
  if (typeof value !== "string") {
    throw new VestigeError("Database row had an invalid string field.", "DB_INVALID_FIELD");
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : Boolean(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asReasoningSteps(value: unknown): ReasoningTrace["reasoningSteps"] {
  return Array.isArray(value) ? (value as ReasoningTrace["reasoningSteps"]) : [];
}

function asPositionIntent(value: unknown): ReasoningTrace["positionIntent"] {
  return value as ReasoningTrace["positionIntent"];
}

function asAgentStatus(value: unknown): Agent["status"] {
  return value === "paused" || value === "archived" ? value : "active";
}

function asTraceStatus(value: unknown): ReasoningTrace["status"] {
  return value === "draft" || value === "pinned" || value === "failed" ? value : "stored";
}

function asConfidence(value: unknown): ReasoningTrace["confidence"] {
  return value === "low" || value === "high" ? value : "medium";
}

function asPositionSide(value: unknown): Position["side"] {
  return value === "short" || value === "neutral" ? value : "long";
}