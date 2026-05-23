import type { SupabaseAdminClient } from "../db/supabase.admin";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "../db/supabase.admin";
import { getMockStore } from "../db/mock.store";
import { VestigeError } from "../shared/errors";
import type { Agent } from "../shared/types/agent";
import type { Follow, Position } from "../shared/types/position";
import type { ReasoningTrace } from "../shared/types/trace";
import type { ListTracesQuery } from "../shared/types/api";
import { VESTIGE_AGENT_PROFILES, profileToAgent } from "../agents/agent.prompts";

export interface TraceRepository {
  findAgent(agentId: string): Promise<Agent>;
  createTrace(trace: ReasoningTrace): Promise<ReasoningTrace>;
  createPosition(position: Position): Promise<Position>;
  // Extended — used by frontend API routes
  listAgents(): Promise<Agent[]>;
  listTraces(query?: ListTracesQuery): Promise<ReasoningTrace[]>;
  findTrace(traceId: string): Promise<ReasoningTrace | null>;
  updateTrace(trace: ReasoningTrace): Promise<ReasoningTrace>;
  listPositions(query?: { agentId?: string; isOpen?: boolean }): Promise<Position[]>;
  findPosition(positionId: string): Promise<Position | null>;
  updatePosition(position: Position): Promise<Position>;
  followPosition(follow: Follow): Promise<Follow>;
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
    const attempts = [true, false];
    let lastError: unknown = null;

    for (const includeEconomyMetadata of attempts) {
      const { data, error } = await this.supabase
        .from("reasoning_traces")
        .insert(toTraceRow(trace, includeEconomyMetadata))
        .select("*")
        .single();

      if (!error && data) {
        return mapTraceRow(data);
      }

      lastError = error;
      if (!includeEconomyMetadata || !shouldRetryWithoutEconomyMetadata(error)) {
        break;
      }

      console.warn("[vestige:trace-repository:economy-metadata-fallback]", {
        operation: "insert",
        traceId: trace.id,
        message: error?.message ?? "unknown error",
      });
    }

    throw new VestigeError(
      (lastError as { message?: string } | null)?.message ?? "Failed to store trace.",
      "TRACE_STORE_FAILED",
    );
  }

  async updateTrace(trace: ReasoningTrace): Promise<ReasoningTrace> {
    const attempts = [true, false];
    let lastError: unknown = null;

    for (const includeEconomyMetadata of attempts) {
      const { data, error } = await this.supabase
        .from("reasoning_traces")
        .update(toTraceRow(trace, includeEconomyMetadata))
        .eq("id", trace.id)
        .select("*")
        .single();

      if (!error && data) {
        return mapTraceRow(data);
      }

      lastError = error;
      if (!includeEconomyMetadata || !shouldRetryWithoutEconomyMetadata(error)) {
        break;
      }

      console.warn("[vestige:trace-repository:economy-metadata-fallback]", {
        operation: "update",
        traceId: trace.id,
        message: error?.message ?? "unknown error",
      });
    }

    throw new VestigeError(
      (lastError as { message?: string } | null)?.message ?? "Failed to update trace.",
      "TRACE_UPDATE_FAILED",
    );
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

  async listPositions(query?: { agentId?: string; isOpen?: boolean }): Promise<Position[]> {
    let q = this.supabase
      .from("positions")
      .select("*")
      .order("opened_at", { ascending: false });

    if (query?.agentId) q = q.eq("agent_id", query.agentId);
    if (query?.isOpen !== undefined) q = q.eq("is_open", query.isOpen);

    const { data, error } = await q;
    if (error) {
      throw new VestigeError(error.message ?? "Failed to list positions.", "LIST_POSITIONS_FAILED");
    }

    return (data ?? []).map(mapPositionRow);
  }

  async findPosition(positionId: string): Promise<Position | null> {
    const { data, error } = await this.supabase
      .from("positions")
      .select("*")
      .eq("id", positionId)
      .single();

    if (error || !data) return null;
    return mapPositionRow(data);
  }

  async updatePosition(position: Position): Promise<Position> {
    const { data, error } = await this.supabase
      .from("positions")
      .update(toPositionRow(position))
      .eq("id", position.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new VestigeError(error?.message ?? "Failed to update position.", "POSITION_UPDATE_FAILED");
    }

    return mapPositionRow(data);
  }

  async followPosition(follow: Follow): Promise<Follow> {
    const { data, error } = await this.supabase
      .from("follows")
      .insert(toFollowRow(follow))
      .select("*")
      .single();

    if (error || !data) {
      throw new VestigeError(error?.message ?? "Failed to follow position.", "FOLLOW_POSITION_FAILED");
    }

    return mapFollowRow(data);
  }
}

export class MockTraceRepository implements TraceRepository {
  async findAgent(agentId: string): Promise<Agent> {
    const store = getMockStore();
    const existing = store.agents.get(agentId);
    if (existing) return existing;
    const profile = VESTIGE_AGENT_PROFILES.find((agent) => agent.id === agentId);
    if (profile) {
      const agent = profileToAgent(profile, new Date().toISOString());
      store.agents.set(agent.id, agent);
      return agent;
    }

    const now = new Date().toISOString();
    const agent: Agent = {
      id: agentId,
      builderId: "00000000-0000-4000-8000-000000000001",
      name: "Vestige Committee",
      slug: "vestige-committee",
      description: "Default production committee synthesizer for market reasoning traces.",
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
    const now = new Date().toISOString();
    for (const profile of VESTIGE_AGENT_PROFILES) {
      if (!store.agents.has(profile.id)) {
        store.agents.set(profile.id, profileToAgent(profile, now));
      }
    }
    const agents = Array.from(store.agents.values());

    // If no persisted agents exist yet, keep the built-in committee available
    // so a fresh local deployment can run a production-shaped trace immediately.
    if (agents.length === 0) {
      const now = new Date().toISOString();
      const fallbackAgent: Agent = {
        id: "00000000-0000-4000-8000-000000000002",
        builderId: "00000000-0000-4000-8000-000000000001",
        name: "Vestige Committee",
        slug: "vestige-committee",
        description: "Default production committee synthesizer for market reasoning traces.",
        model: "deepseek-r1",
        status: "active",
        systemPrompt:
          "You are a market intelligence agent. Produce disciplined, structured trading reasoning only.",
        createdAt: now,
        updatedAt: now,
      };
      store.agents.set(fallbackAgent.id, fallbackAgent);
      return [fallbackAgent];
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

  async updateTrace(trace: ReasoningTrace): Promise<ReasoningTrace> {
    getMockStore().traces.set(trace.id, trace);
    return trace;
  }

  async createPosition(position: Position): Promise<Position> {
    getMockStore().positions.set(position.id, position);
    return position;
  }

  async listPositions(query?: { agentId?: string; isOpen?: boolean }): Promise<Position[]> {
    let positions = Array.from(getMockStore().positions.values());
    if (query?.agentId) positions = positions.filter((position) => position.agentId === query.agentId);
    if (query?.isOpen !== undefined) positions = positions.filter((position) => position.isOpen === query.isOpen);
    return positions.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  }

  async findPosition(positionId: string): Promise<Position | null> {
    return getMockStore().positions.get(positionId) ?? null;
  }

  async updatePosition(position: Position): Promise<Position> {
    getMockStore().positions.set(position.id, position);
    return position;
  }

  async followPosition(follow: Follow): Promise<Follow> {
    getMockStore().follows.set(follow.id, follow);
    return follow;
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
  const paymentReceipts = asPaymentReceipts(row.payment_receipts ?? row.paymentReceipts) ?? [];
  const unlockCount = optionalNumber(row.unlock_count ?? row.unlockCount) ?? paymentReceipts.length;
  const locked = row.locked === undefined ? true : asBoolean(row.locked);
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
    verdict: asStructuredVerdict(row.verdict),
    rawModelOutput: optionalString(row.raw_model_output),
    status: asTraceStatus(row.status),
    premium: asBoolean(row.premium),
    accessTier: asTraceAccessTier(row.access_tier ?? row.accessTier ?? (asBoolean(row.premium) ? "premium" : "public")),
    unlockPriceUsdc: optionalString(row.unlock_price_usdc ?? row.unlockPriceUsdc),
    unlockCount,
    demandScore: optionalNumber(row.demand_score ?? row.demandScore) ?? unlockCount,
    locked,
    creatorWalletAddress: optionalString(row.creator_wallet_address ?? row.creatorWalletAddress),
    paymentReceipts,
    traceMetrics: asTraceMetrics(row.trace_metrics ?? row.traceMetrics),
    createdAt: asString(row.created_at),
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

function mapFollowRow(row: Record<string, unknown>): Follow {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    agentId: asString(row.agent_id),
    positionId: optionalString(row.position_id),
    createdAt: asString(row.created_at),
  };
}

function toTraceRow(trace: ReasoningTrace, includeEconomyMetadata = true): Record<string, unknown> {
  const row: Record<string, unknown> = {
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
    verdict: trace.verdict,
    raw_model_output: trace.rawModelOutput,
    status: trace.status,
    premium: trace.premium,
    created_at: trace.createdAt,
  };

  if (includeEconomyMetadata) {
    row.access_tier = trace.accessTier;
    row.unlock_price_usdc = trace.unlockPriceUsdc;
    row.unlock_count = trace.unlockCount;
    row.demand_score = trace.demandScore;
    row.locked = trace.locked ?? true;
    row.creator_wallet_address = trace.creatorWalletAddress;
    row.payment_receipts = trace.paymentReceipts;
    row.trace_metrics = trace.traceMetrics;
  }

  return row;
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

function toFollowRow(follow: Follow): Record<string, unknown> {
  return {
    id: follow.id,
    user_id: follow.userId,
    agent_id: follow.agentId,
    position_id: follow.positionId,
    created_at: follow.createdAt,
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

function asStructuredVerdict(value: unknown): ReasoningTrace["verdict"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as ReasoningTrace["verdict"];
}

function asTraceAccessTier(value: unknown): ReasoningTrace["accessTier"] {
  return value === "institutional" || value === "premium" ? value : "public";
}

function asPaymentReceipts(value: unknown): ReasoningTrace["paymentReceipts"] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is NonNullable<ReasoningTrace["paymentReceipts"]>[number] => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return record.protocol === "x402" &&
      typeof record.receiptId === "string" &&
      typeof record.amount === "string" &&
      record.asset === "USDC" &&
      typeof record.network === "string" &&
      typeof record.unlockedAt === "string";
  });
}

function asTraceMetrics(value: unknown): ReasoningTrace["traceMetrics"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as ReasoningTrace["traceMetrics"];
}

function asAgentStatus(value: unknown): Agent["status"] {
  return value === "paused" || value === "archived" ? value : "active";
}

function asTraceStatus(value: unknown): ReasoningTrace["status"] {
  return value === "draft" ||
    value === "failed"
    ? value
    : "stored";
}

function asConfidence(value: unknown): ReasoningTrace["confidence"] {
  return value === "low" || value === "high" ? value : "medium";
}

function asPositionSide(value: unknown): Position["side"] {
  return value === "short" || value === "neutral" ? value : "long";
}

function shouldRetryWithoutEconomyMetadata(error: unknown): boolean {
  const code = typeof error === "object" &&
    error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "";
  const message = typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message.toLowerCase()
    : "";

  if (code === "42703" || code === "PGRST204") return true;

  return (
    message.includes("column") &&
    (
      message.includes("does not exist") ||
      message.includes("not found") ||
      message.includes("could not find") ||
      message.includes("schema cache") ||
      message.includes("unknown")
    )
  );
}
