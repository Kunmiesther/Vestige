import { createSupabaseAdminClient, type SupabaseAdminClient } from "../db/supabase.admin";
import { VestigeError } from "../shared/errors";
import type { Agent } from "../shared/types/agent";
import type { ListTracesQuery } from "../shared/types/api";
import type { Follow, Position } from "../shared/types/position";
import type { ReasoningTrace, TracePaymentReceipt, TracePublicationReceipt } from "../shared/types/trace";
import { VESTIGE_AGENT_PROFILES, profileToAgent } from "../agents/agent.prompts";

type DbRow = Record<string, unknown>;

export interface TraceRepository {
  findAgent(agentId: string): Promise<Agent>;
  createTrace(trace: ReasoningTrace): Promise<ReasoningTrace>;
  recordUnlock(traceId: string, receipt: TracePaymentReceipt): Promise<ReasoningTrace>;
  recordPublication(traceId: string, receipt: TracePublicationReceipt): Promise<ReasoningTrace>;
  createPosition(position: Position): Promise<Position>;
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
    await this.ensureSeedAgents();

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
    await this.ensureSeedAgents();

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
      .from("traces")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(query?.limit ?? 50);

    if (query?.agentId) q = q.eq("agent_id", query.agentId);
    if (query?.assetSymbol) q = q.eq("asset_symbol", query.assetSymbol);

    const { data, error } = await q;

    if (error) {
      throw new VestigeError(error.message ?? "Failed to list traces.", "LIST_TRACES_FAILED");
    }

    return this.withTraceReceipts((data ?? []).map(mapTraceRow));
  }

  async findTrace(traceId: string): Promise<ReasoningTrace | null> {
    const { data, error } = await this.supabase
      .from("traces")
      .select("*")
      .eq("id", traceId)
      .single();

    if (error || !data) return null;

    const [trace] = await this.withTraceReceipts([mapTraceRow(data)]);
    return trace ?? null;
  }

  async createTrace(trace: ReasoningTrace): Promise<ReasoningTrace> {
    await this.ensureWallet(trace.creatorWalletAddress, "creator");

    const { data, error } = await this.supabase
      .from("traces")
      .insert(toTraceRow(trace))
      .select("*")
      .single();

    if (error || !data) {
      throw new VestigeError(error?.message ?? "Failed to store trace.", "TRACE_STORE_FAILED");
    }

    return mapTraceRow(data);
  }

  async updateTrace(trace: ReasoningTrace): Promise<ReasoningTrace> {
    await this.ensureWallet(trace.creatorWalletAddress, "creator");

    const { data, error } = await this.supabase
      .from("traces")
      .update(toTraceRow(trace))
      .eq("id", trace.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new VestigeError(error?.message ?? "Failed to update trace.", "TRACE_UPDATE_FAILED");
    }

    const persisted = mapTraceRow(data);
    await this.syncTraceReceipts(persisted.id, trace.paymentReceipts ?? [], trace.publicationReceipts ?? []);

    const [withReceipts] = await this.withTraceReceipts([persisted]);
    return withReceipts ?? persisted;
  }

  async recordUnlock(traceId: string, receipt: TracePaymentReceipt): Promise<ReasoningTrace> {
    const trace = await this.findTrace(traceId);
    if (!trace) {
      throw new VestigeError("Trace not found.", "TRACE_NOT_FOUND");
    }

    await this.ensureWallet(receipt.payer, "unlocker");
    await this.insertUnlock(traceId, receipt);
    await this.insertTransaction({
      traceId,
      walletAddress: receipt.payer,
      txHash: receipt.txHash ?? receipt.receiptId,
      kind: "unlock",
      amount: receipt.amount,
      asset: receipt.asset,
      network: receipt.network,
      status: receipt.settlementStatus ?? "confirmed",
      metadata: {
        receiptId: receipt.receiptId,
        payTo: receipt.payTo,
        facilitatorReference: receipt.facilitatorReference,
      },
      createdAt: receipt.unlockedAt,
    });

    await this.refreshTraceEconomy(traceId);
    const persisted = await this.findTrace(traceId);
    if (!persisted) {
      throw new VestigeError("Trace not found after unlock persistence.", "TRACE_NOT_FOUND");
    }

    return persisted;
  }

  async recordPublication(traceId: string, receipt: TracePublicationReceipt): Promise<ReasoningTrace> {
    const trace = await this.findTrace(traceId);
    if (!trace) {
      throw new VestigeError("Trace not found.", "TRACE_NOT_FOUND");
    }

    await this.ensureWallet(receipt.publisher, "publisher");
    await this.insertPublication(traceId, receipt);
    if (receipt.txHash) {
      await this.insertTransaction({
        traceId,
        walletAddress: receipt.publisher,
        txHash: receipt.txHash,
        kind: "publish",
        amount: receipt.amount,
        asset: receipt.asset,
        network: receipt.network,
        status: receipt.settlementStatus ?? "confirmed",
        metadata: {
          publicationId: receipt.publicationId,
          payTo: receipt.payTo,
          message: receipt.message,
          signature: receipt.signature,
          contentDigest: receipt.contentDigest,
          storage: receipt.storage,
          irysId: receipt.irysId,
          ipfsCid: receipt.ipfsCid,
        },
        createdAt: receipt.publishedAt,
      });
    }

    const { error } = await this.supabase
      .from("traces")
      .update({
        publish_tx_hash: receipt.txHash,
        published_to_arc: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", traceId);

    if (error) {
      throw new VestigeError(error.message ?? "Failed to update trace publication state.", "TRACE_UPDATE_FAILED");
    }

    const persisted = await this.findTrace(traceId);
    if (!persisted) {
      throw new VestigeError("Trace not found after publication persistence.", "TRACE_NOT_FOUND");
    }

    return persisted;
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

  private async ensureSeedAgents(): Promise<void> {
    const now = new Date().toISOString();
    const agents = VESTIGE_AGENT_PROFILES.map((profile) => toAgentRow(profileToAgent(profile, now)));

    const { error } = await this.supabase
      .from("agents")
      .upsert(agents, { onConflict: "id" });

    if (error) {
      throw new VestigeError(error.message ?? "Failed to seed Vestige agents.", "AGENT_SEED_FAILED");
    }
  }

  private async withTraceReceipts(traces: ReasoningTrace[]): Promise<ReasoningTrace[]> {
    const traceIds = traces.map((trace) => trace.id);
    if (traceIds.length === 0) return traces;

    const [unlocks, publications] = await Promise.all([
      this.listUnlockReceipts(traceIds),
      this.listPublicationReceipts(traceIds),
    ]);

    return traces.map((trace) => {
      const paymentReceipts = unlocks.get(trace.id) ?? [];
      const publicationReceipts = publications.get(trace.id) ?? [];
      const unlockCount = paymentReceipts.length;
      return {
        ...trace,
        paymentReceipts,
        publicationReceipts,
        unlockCount,
        demandScore: Math.max(trace.demandScore ?? 0, unlockCount),
      };
    });
  }

  private async listUnlockReceipts(traceIds: string[]): Promise<Map<string, TracePaymentReceipt[]>> {
    const { data, error } = await this.supabase
      .from("unlocks")
      .select("*")
      .in("trace_id", traceIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw new VestigeError(error.message ?? "Failed to load unlock receipts.", "LIST_UNLOCKS_FAILED");
    }

    return groupByTraceId(data ?? [], mapUnlockRow);
  }

  private async listPublicationReceipts(traceIds: string[]): Promise<Map<string, TracePublicationReceipt[]>> {
    const { data, error } = await this.supabase
      .from("publishes")
      .select("*")
      .in("trace_id", traceIds)
      .order("published_at", { ascending: false });

    if (error) {
      throw new VestigeError(error.message ?? "Failed to load publication receipts.", "LIST_PUBLISHES_FAILED");
    }

    return groupByTraceId(data ?? [], mapPublishRow);
  }

  private async syncTraceReceipts(
    traceId: string,
    paymentReceipts: TracePaymentReceipt[],
    publicationReceipts: TracePublicationReceipt[],
  ): Promise<void> {
    await Promise.all([
      ...paymentReceipts.map((receipt) => this.insertUnlock(traceId, receipt)),
      ...publicationReceipts.map((receipt) => this.insertPublication(traceId, receipt)),
    ]);

    await Promise.all([
      ...paymentReceipts.map((receipt) =>
        this.insertTransaction({
          traceId,
          walletAddress: receipt.payer,
          txHash: receipt.txHash ?? receipt.receiptId,
          kind: "unlock",
          amount: receipt.amount,
          asset: receipt.asset,
          network: receipt.network,
          status: receipt.settlementStatus ?? "confirmed",
          metadata: { receiptId: receipt.receiptId, payTo: receipt.payTo },
          createdAt: receipt.unlockedAt,
        }),
      ),
      ...publicationReceipts
        .filter((receipt) => Boolean(receipt.txHash))
        .map((receipt) =>
          this.insertTransaction({
            traceId,
            walletAddress: receipt.publisher,
            txHash: receipt.txHash!,
            kind: "publish",
            amount: receipt.amount,
            asset: receipt.asset,
            network: receipt.network,
            status: receipt.settlementStatus ?? "confirmed",
            metadata: { publicationId: receipt.publicationId, contentDigest: receipt.contentDigest },
            createdAt: receipt.publishedAt,
          }),
        ),
    ]);

    await this.refreshTraceEconomy(traceId);
  }

  private async insertUnlock(traceId: string, receipt: TracePaymentReceipt): Promise<void> {
    await this.ensureWallet(receipt.payer, "unlocker");

    const { error } = await this.supabase
      .from("unlocks")
      .upsert(toUnlockRow(traceId, receipt), { onConflict: "tx_hash" });

    if (error) {
      throw new VestigeError(error.message ?? "Failed to persist unlock receipt.", "UNLOCK_STORE_FAILED");
    }
  }

  private async insertPublication(traceId: string, receipt: TracePublicationReceipt): Promise<void> {
    await this.ensureWallet(receipt.publisher, "publisher");

    const { error } = await this.supabase
      .from("publishes")
      .upsert(toPublishRow(traceId, receipt), { onConflict: "publication_id" });

    if (error) {
      throw new VestigeError(error.message ?? "Failed to persist publication receipt.", "PUBLISH_STORE_FAILED");
    }
  }

  private async insertTransaction(input: {
    traceId: string;
    walletAddress?: string;
    txHash: string;
    kind: "unlock" | "publish";
    amount?: string;
    asset?: string;
    network?: string;
    status: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }): Promise<void> {
    await this.ensureWallet(input.walletAddress, input.kind === "unlock" ? "unlocker" : "publisher");

    const { error } = await this.supabase
      .from("transactions")
      .upsert({
        trace_id: input.traceId,
        wallet_address: normalizeAddress(input.walletAddress),
        tx_hash: input.txHash,
        kind: input.kind,
        amount: input.amount,
        asset: input.asset,
        network: input.network,
        status: input.status,
        metadata: input.metadata,
        created_at: input.createdAt,
      }, { onConflict: "tx_hash" });

    if (error) {
      throw new VestigeError(error.message ?? "Failed to persist transaction metadata.", "TRANSACTION_STORE_FAILED");
    }
  }

  private async refreshTraceEconomy(traceId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from("unlocks")
      .select("tx_hash")
      .eq("trace_id", traceId)
      .eq("settlement_status", "confirmed");

    if (error) {
      throw new VestigeError(error.message ?? "Failed to refresh trace unlock count.", "TRACE_UPDATE_FAILED");
    }

    const unlockCount = data?.length ?? 0;
    const { error: updateError } = await this.supabase
      .from("traces")
      .update({
        unlock_count: unlockCount,
        demand_score: unlockCount,
        transaction_hash: data?.[0]?.tx_hash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", traceId);

    if (updateError) {
      throw new VestigeError(updateError.message ?? "Failed to update trace unlock count.", "TRACE_UPDATE_FAILED");
    }
  }

  private async ensureWallet(address: string | null | undefined, walletType?: string): Promise<void> {
    const walletAddress = normalizeAddress(address);
    if (!walletAddress) return;

    const now = new Date().toISOString();
    const { data: existingWallet, error: walletLookupError } = await this.supabase
      .from("wallets")
      .select("user_id")
      .eq("address", walletAddress)
      .maybeSingle();

    if (walletLookupError) {
      throw new VestigeError(walletLookupError.message ?? "Failed to load wallet.", "WALLET_STORE_FAILED");
    }

    let userId = optionalString(existingWallet?.user_id);
    if (!userId) {
      const { data: user, error: userError } = await this.supabase
        .from("users")
        .insert({ updated_at: now })
        .select("id")
        .single();

      if (userError || !user) {
        throw new VestigeError(userError?.message ?? "Failed to persist user.", "USER_STORE_FAILED");
      }

      userId = asString(user.id);
    }

    const { error } = await this.supabase
      .from("wallets")
      .upsert({
        address: walletAddress,
        user_id: userId,
        wallet_type: walletType,
        last_seen_at: now,
        updated_at: now,
      }, { onConflict: "address" });

    if (error) {
      throw new VestigeError(error.message ?? "Failed to persist wallet.", "WALLET_STORE_FAILED");
    }
  }
}

export function createTraceRepository(): TraceRepository {
  return new SupabaseTraceRepository();
}

function mapAgentRow(row: DbRow): Agent {
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

function mapTraceRow(row: DbRow): ReasoningTrace {
  const agentOutputs = row.agent_outputs;
  const synthesis = optionalString(row.synthesis);
  const unlockCount = optionalNumber(row.unlock_count) ?? 0;
  const accessTier = asTraceAccessTier(row.access_tier ?? (asBoolean(row.premium) ? "premium" : "public"));

  return {
    id: asString(row.id),
    agentId: asString(row.agent_id),
    builderId: asString(row.builder_id),
    market: asString(row.market_question ?? row.market),
    assetSymbol: asString(row.asset_symbol),
    thesis: optionalString(row.thesis) ?? synthesis ?? "",
    reasoningSteps: asReasoningSteps(row.reasoning_steps ?? agentOutputs),
    risks: asStringArray(row.risks),
    catalysts: asStringArray(row.catalysts),
    confidence: asConfidence(row.confidence),
    positionIntent: asPositionIntent(row.position_intent),
    verdict: asStructuredVerdict(row.verdict),
    rawModelOutput: optionalString(row.raw_model_output),
    status: asTraceStatus(row.status),
    premium: asBoolean(row.premium),
    accessTier,
    unlockPriceUsdc: optionalString(row.unlock_price ?? row.unlock_price_usdc),
    unlockCount,
    demandScore: optionalNumber(row.demand_score) ?? unlockCount,
    locked: row.locked === undefined ? accessTier !== "public" : asBoolean(row.locked),
    creatorWalletAddress: optionalString(row.creator_wallet ?? row.creator_wallet_address),
    paymentReceipts: [],
    publicationReceipts: [],
    traceMetrics: asTraceMetrics(row.trace_metrics),
    createdAt: asString(row.created_at),
  };
}

function mapUnlockRow(row: DbRow): TracePaymentReceipt {
  return {
    receiptId: asString(row.receipt_id ?? row.tx_hash),
    protocol: "x402",
    amount: asText(row.amount_paid),
    asset: "USDC",
    network: asString(row.network),
    settlementStatus: asSettlementStatus(row.settlement_status),
    payer: optionalString(row.wallet_address),
    payTo: optionalString(row.pay_to),
    txHash: optionalString(row.tx_hash),
    facilitatorReference: optionalString(row.facilitator_reference),
    unlockedAt: asString(row.created_at),
  };
}

function mapPublishRow(row: DbRow): TracePublicationReceipt {
  return {
    publicationId: asString(row.publication_id ?? row.id),
    network: asString(row.network),
    publisher: asString(row.wallet_address),
    amount: optionalString(row.amount),
    asset: row.asset === "USDC" ? "USDC" : undefined,
    payTo: optionalString(row.pay_to),
    settlementStatus: asSettlementStatus(row.settlement_status),
    message: asString(row.message),
    signature: asString(row.signature),
    contentDigest: asString(row.content_digest),
    storage: asStorage(row.storage),
    irysId: optionalString(row.irys_id),
    ipfsCid: optionalString(row.ipfs_cid),
    txHash: optionalString(row.tx_hash),
    publishedAt: asString(row.published_at),
  };
}

function mapPositionRow(row: DbRow): Position {
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

function mapFollowRow(row: DbRow): Follow {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    agentId: asString(row.agent_id),
    positionId: optionalString(row.position_id),
    createdAt: asString(row.created_at),
  };
}

function toAgentRow(agent: Agent): DbRow {
  return {
    id: agent.id,
    builder_id: agent.builderId,
    name: agent.name,
    slug: agent.slug,
    description: agent.description,
    model: agent.model,
    status: agent.status,
    system_prompt: agent.systemPrompt,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
  };
}

function toTraceRow(trace: ReasoningTrace): DbRow {
  const latestPayment = latestPaymentReceipt(trace.paymentReceipts ?? []);
  const latestPublication = latestPublicationReceipt(trace.publicationReceipts ?? []);

  return {
    id: trace.id,
    agent_id: trace.agentId,
    builder_id: trace.builderId,
    creator_wallet: normalizeAddress(trace.creatorWalletAddress),
    creator_type: trace.creatorWalletAddress ? "wallet" : "anonymous",
    market_question: trace.market,
    asset_symbol: trace.assetSymbol,
    verdict: trace.verdict,
    synthesis: trace.thesis,
    agent_outputs: trace.reasoningSteps,
    premium: trace.premium ?? false,
    unlock_price: trace.unlockPriceUsdc,
    unlock_count: trace.unlockCount ?? trace.paymentReceipts?.length ?? 0,
    transaction_hash: latestPayment?.txHash ?? latestPayment?.receiptId,
    publish_tx_hash: latestPublication?.txHash,
    published_to_arc: Boolean(latestPublication),
    thesis: trace.thesis,
    reasoning_steps: trace.reasoningSteps,
    risks: trace.risks,
    catalysts: trace.catalysts,
    confidence: trace.confidence,
    position_intent: trace.positionIntent,
    raw_model_output: trace.rawModelOutput,
    status: trace.status,
    access_tier: trace.accessTier ?? (trace.premium ? "premium" : "public"),
    demand_score: trace.demandScore ?? trace.unlockCount ?? 0,
    locked: trace.locked ?? Boolean(trace.premium),
    trace_metrics: trace.traceMetrics,
    created_at: trace.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function toUnlockRow(traceId: string, receipt: TracePaymentReceipt): DbRow {
  const txHash = receipt.txHash ?? receipt.receiptId;
  return {
    trace_id: traceId,
    wallet_address: normalizeAddress(receipt.payer),
    tx_hash: txHash,
    amount_paid: receipt.amount,
    receipt_id: receipt.receiptId,
    network: receipt.network,
    asset: receipt.asset,
    pay_to: normalizeAddress(receipt.payTo),
    settlement_status: receipt.settlementStatus ?? "confirmed",
    facilitator_reference: receipt.facilitatorReference,
    created_at: receipt.unlockedAt,
  };
}

function toPublishRow(traceId: string, receipt: TracePublicationReceipt): DbRow {
  return {
    trace_id: traceId,
    wallet_address: normalizeAddress(receipt.publisher),
    tx_hash: receipt.txHash,
    publication_id: receipt.publicationId,
    network: receipt.network,
    amount: receipt.amount,
    asset: receipt.asset,
    pay_to: normalizeAddress(receipt.payTo),
    settlement_status: receipt.settlementStatus ?? "confirmed",
    message: receipt.message,
    signature: receipt.signature,
    content_digest: receipt.contentDigest,
    storage: receipt.storage,
    irys_id: receipt.irysId,
    ipfs_cid: receipt.ipfsCid,
    published_at: receipt.publishedAt,
  };
}

function toPositionRow(position: Position): DbRow {
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

function toFollowRow(follow: Follow): DbRow {
  return {
    id: follow.id,
    user_id: follow.userId,
    agent_id: follow.agentId,
    position_id: follow.positionId,
    created_at: follow.createdAt,
  };
}

function groupByTraceId<T>(rows: DbRow[], mapper: (row: DbRow) => T): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const traceId = optionalString(row.trace_id);
    if (!traceId) continue;
    const current = grouped.get(traceId) ?? [];
    current.push(mapper(row));
    grouped.set(traceId, current);
  }
  return grouped;
}

function latestPaymentReceipt(receipts: TracePaymentReceipt[]): TracePaymentReceipt | undefined {
  return receipts.slice().sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime())[0];
}

function latestPublicationReceipt(receipts: TracePublicationReceipt[]): TracePublicationReceipt | undefined {
  return receipts.slice().sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];
}

function asString(value: unknown): string {
  if (typeof value !== "string") {
    throw new VestigeError("Database row had an invalid string field.", "DB_INVALID_FIELD");
  }
  return value;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new VestigeError("Database row had an invalid text field.", "DB_INVALID_FIELD");
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
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
  if (!value || typeof value !== "object") {
    return { side: "neutral", timeHorizon: "swing" };
  }
  return value as ReasoningTrace["positionIntent"];
}

function asStructuredVerdict(value: unknown): ReasoningTrace["verdict"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as ReasoningTrace["verdict"];
}

function asTraceAccessTier(value: unknown): ReasoningTrace["accessTier"] {
  return value === "institutional" || value === "premium" ? value : "public";
}

function asTraceMetrics(value: unknown): ReasoningTrace["traceMetrics"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as ReasoningTrace["traceMetrics"];
}

function asAgentStatus(value: unknown): Agent["status"] {
  return value === "paused" || value === "archived" ? value : "active";
}

function asTraceStatus(value: unknown): ReasoningTrace["status"] {
  return value === "draft" || value === "failed" ? value : "stored";
}

function asConfidence(value: unknown): ReasoningTrace["confidence"] {
  return value === "low" || value === "high" ? value : "medium";
}

function asPositionSide(value: unknown): Position["side"] {
  return value === "short" || value === "neutral" ? value : "long";
}

function asSettlementStatus(value: unknown): "submitted" | "confirmed" | "failed" | undefined {
  return value === "submitted" || value === "failed" ? value : "confirmed";
}

function asStorage(value: unknown): TracePublicationReceipt["storage"] {
  return value === "irys" || value === "ipfs" ? value : "local";
}

function normalizeAddress(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || undefined;
}
