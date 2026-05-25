import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GroqHttpClient, type GroqClient, type GroqGenerateJsonInput, type GroqGenerateJsonResult } from "../ai/groq.client";
import { createMarketDataService } from "../markets/market.service";
import type { MarketDataService, MarketSnapshot } from "../markets/market.types";
import { createPositionService, type PositionService } from "../positions/position.service";
import { reasoningTraceSchema } from "../shared/schemas/trace.zod";
import { VestigeError } from "../shared/errors";
import type { RunAgentRequest, RunAgentResponse } from "../shared/types/api";
import type { Agent } from "../shared/types/agent";
import type { ReasoningStep, ReasoningTrace, VerdictAction } from "../shared/types/trace";
import { createTraceRepository, type TraceRepository } from "../traces/trace.repository";
import { createTraceService, type TraceService } from "../traces/trace.service";
import { ensureTraceIsPaid, maskTraceForLockedAccess } from "../traces/trace.access";
import {
  AGENT_CONTRIBUTION_RESPONSE_CONTRACT,
  JSON_ONLY_RESPONSE_RULES,
  VESTIGE_AGENT_PROFILES,
  type VestigeAgentProfile,
} from "./agent.prompts";

export const runAgentRequestSchema = z.object({
  market: z.string().min(1),
  assetSymbol: z.string().min(1),
  context: z
    .object({
      price: z.number().optional(),
      headlines: z.array(z.string()).optional(),
      marketSnapshot: z
        .object({
          symbol: z.string(),
          baseAsset: z.string(),
          quoteAsset: z.string(),
          price: z.number(),
          source: z.string(),
          volume24h: z.number().optional(),
          high24h: z.number().optional(),
          low24h: z.number().optional(),
          change24hPercent: z.number().optional(),
          liquidityUsd: z.number().optional(),
          volatility24h: z.number().optional(),
          marketStructure: z.string().optional(),
          fetchedAt: z.string(),
        })
        .optional(),
      marketData: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export interface AgentRunner {
  run(agentId: string, request: RunAgentRequest): Promise<RunAgentResponse>;
}

interface GeneratedTraceBody {
  thesis: string;
  reasoningSteps: ReasoningStep[];
  risks: string[];
  catalysts: string[];
  confidence: ReasoningTrace["confidence"];
  positionIntent: ReasoningTrace["positionIntent"];
  verdict?: ReasoningTrace["verdict"];
  traceMetrics?: ReasoningTrace["traceMetrics"];
}

interface AgentContribution {
  agent: string;
  specialty: string;
  stance: ReasoningTrace["positionIntent"]["side"];
  confidence: ReasoningTrace["confidence"];
  observation: string;
  inference: string;
  evidence: string[];
  verdict: NonNullable<ReasoningTrace["verdict"]>["action"];
  reasoning: string;
  key_risks: string[];
  opportunities: string[];
  recommendation: string;
}

interface EvidenceFragment {
  text: string;
  source: string;
  weight: number;
}

interface EvidenceSnapshot {
  market: string;
  assetSymbol: string;
  live: {
    price?: number;
    quoteAsset?: string;
    change24hPercent?: number;
    volume24h?: number;
    liquidityUsd?: number;
    high24h?: number;
    low24h?: number;
    volatility24h?: number;
    marketStructure?: string;
    source?: string;
    fetchedAt?: string;
  };
  headlines: string[];
  context: Record<string, string | number | boolean>;
  signals: string[];
  missing: string[];
}

interface CommitteeScoreMetrics {
  score: number;
  confidence: ReasoningTrace["confidence"];
  action: VerdictAction;
  agreement: number;
  disagreement: number;
  directionalConviction: number;
  neutralPressure: number;
  evidenceQuality: number;
  catalystStrength: number;
  uncertainty: number;
  volatilityRisk: number;
  riskAsymmetry: number;
  confidenceConsistency: number;
  sentimentDivergence: number;
}

interface PositioningDecisionInput {
  score: number;
  side: ReasoningTrace["positionIntent"]["side"];
  netDirection: number;
  agreement: number;
  directionalConviction: number;
  riskAsymmetry: number;
  uncertainty: number;
  catalystStrength: number;
  contradictionIntensity: number;
  riskOffPressure: number;
  neutralPressure: number;
}

const POSITIONING_ACTIONS = [
  "Momentum Favors Continuation",
  "Structure Weakening",
  "Conviction Divergence",
  "Liquidity Trap Risk",
  "Expansion Setup",
  "Fragile Breakout",
  "High Beta Rotation",
  "Regime Shift Watch",
] as const satisfies readonly VerdictAction[];

const GROQ_LIGHTWEIGHT_MODEL = process.env.GROQ_AGENT_MODEL ?? process.env.GROQ_LIGHTWEIGHT_MODEL ?? "llama-3.1-8b-instant";
const GROQ_SYNTHESIS_MODEL = process.env.GROQ_SYNTHESIS_MODEL ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const AGENT_MAX_TOKENS = readPositiveInt(process.env.GROQ_AGENT_MAX_TOKENS, 560);
const SYNTHESIS_MAX_TOKENS = readPositiveInt(process.env.GROQ_SYNTHESIS_MAX_TOKENS, 1400);
const AGENT_CONCURRENCY = readPositiveInt(process.env.VESTIGE_AGENT_CONCURRENCY, 2);
const AGENT_QUEUE_DELAY_MS = readPositiveInt(process.env.VESTIGE_AGENT_QUEUE_DELAY_MS, 150);
const MAX_HEADLINES = readPositiveInt(process.env.VESTIGE_MAX_HEADLINES, 4);
const MAX_HEADLINE_CHARS = 140;
const MAX_CONTEXT_FIELDS = 12;
const MAX_CONTEXT_FIELD_CHARS = 160;

const agentContributionSchema = z
  .object({
    stance: z.enum(["long", "short", "neutral"]),
    confidence: z.enum(["low", "medium", "high"]),
    observation: z.string().min(20),
    inference: z.string().min(20),
    evidence: z.array(z.string().min(1)).min(2).max(5),
    verdict: z.enum(POSITIONING_ACTIONS),
    reasoning: z.string().min(20),
    key_risks: z.array(z.string().min(1)).min(1).max(6),
    opportunities: z.array(z.string().min(1)).min(1).max(6),
    recommendation: z.string().min(10),
  })
  .strict();

const generatedTraceBodySchema = reasoningTraceSchema
  .pick({
    thesis: true,
    reasoningSteps: true,
    risks: true,
    catalysts: true,
    confidence: true,
    positionIntent: true,
    verdict: true,
  })
  .partial({ verdict: true })
  .strict();

export class DefaultAgentRunner implements AgentRunner {
  constructor(
    private readonly repository: TraceRepository = createTraceRepository(),
    private readonly groqClient: GroqClient = new GroqHttpClient(),
    private readonly traceService: TraceService = createTraceService(repository),
    private readonly positionService: PositionService = createPositionService(repository),
    private readonly marketDataService: MarketDataService = createMarketDataService(),
  ) {}

  async run(agentId: string, request: RunAgentRequest): Promise<RunAgentResponse> {
    const input = runAgentRequestSchema.parse(request);
    const agent = await this.repository.findAgent(agentId);

    if (agent.status !== "active") {
      throw new VestigeError("Agent is not active.", "AGENT_NOT_ACTIVE");
    }

    const enrichedInput = await this.enrichWithLiveMarketData(input);
    const generatedPayload = await this.generateTraceBody(agent, enrichedInput);
    const now = new Date().toISOString();
    const verdict = generatedPayload.verdict;

    if (!verdict) {
      throw new VestigeError("Agent committee did not produce a structured verdict.", "AGENT_VERDICT_MISSING");
    }

    const accessTier = accessTierFromVerdict(verdict);
    const candidateTrace: ReasoningTrace = {
      id: randomUUID(),
      agentId: agent.id,
      builderId: agent.builderId,
      market: enrichedInput.market,
      assetSymbol: enrichedInput.assetSymbol.toUpperCase(),
      thesis: generatedPayload.thesis,
      reasoningSteps: generatedPayload.reasoningSteps,
      risks: generatedPayload.risks,
      catalysts: generatedPayload.catalysts,
      confidence: generatedPayload.confidence,
      positionIntent: generatedPayload.positionIntent,
      verdict,
      rawModelOutput: JSON.stringify(generatedPayload),
      status: "stored",
      premium: true,
      accessTier,
      unlockPriceUsdc: accessTier === "public" ? undefined : process.env.X402_PREMIUM_TRACE_USDC ?? "0.01",
      unlockCount: 0,
      demandScore: 0,
      locked: true,
      creatorWalletAddress: extractCreatorWalletAddress(enrichedInput.context?.marketData),
      traceMetrics: generatedPayload.traceMetrics,
      createdAt: now,
    };

    const validatedTrace = reasoningTraceSchema.parse(candidateTrace);
    const trace = await this.traceService.storeTrace(ensureTraceIsPaid(validatedTrace));
    const position = await this.positionService.createFromTrace(trace);

    return { trace: maskTraceForLockedAccess(trace), position };
  }

  private async enrichWithLiveMarketData(input: RunAgentRequest): Promise<RunAgentRequest> {
    const snapshot = await this.marketDataService.getSnapshot(input.assetSymbol);
    if (!snapshot) {
      throw new VestigeError("Live market data unavailable. Analysis aborted.", "LIVE_MARKET_DATA_UNAVAILABLE");
    }

    return {
      ...input,
      context: {
        ...input.context,
        price: input.context?.price ?? snapshot.price,
        marketSnapshot: snapshot,
        marketData: {
          ...(input.context?.marketData ?? {}),
          livePrice: snapshot.price,
          source: snapshot.source,
          volume24h: snapshot.volume24h,
          high24h: snapshot.high24h,
          low24h: snapshot.low24h,
          change24hPercent: snapshot.change24hPercent,
          liquidityUsd: snapshot.liquidityUsd,
          volatility24h: snapshot.volatility24h,
          marketStructure: snapshot.marketStructure,
          fetchedAt: snapshot.fetchedAt,
        },
      },
    };
  }

  private async generateTraceBody(
    agent: Agent,
    input: RunAgentRequest,
  ): Promise<GeneratedTraceBody> {
    const evidence = buildEvidenceSnapshot(input);
    const contributions = await this.generateContributions(evidence);

    const generated = await generateModelJson(this.groqClient, {
      model: GROQ_SYNTHESIS_MODEL,
      temperature: 0.15,
      maxTokens: SYNTHESIS_MAX_TOKENS,
      maxAttempts: 3,
      messages: [
        {
          role: "system",
          content: buildSynthesisPrompt(agent),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Synthesize one committee trace from compact specialist memos.",
            evidence,
            agentContributions: compactContributionsForSynthesis(contributions),
          }),
        },
      ],
    }).catch((error) => {
      console.error("[vestige:agents:synthesis-generation-failed]", {
        error: error instanceof Error ? error.message : "unknown error",
      });
      return null;
    });

    if (!generated) return synthesizeFromContributions(input, contributions);

    const parsed = generatedTraceBodySchema.safeParse(generated.parsed);
    if (parsed.success) {
      return finalizeGeneratedTraceBody(parsed.data, contributions, input);
    }

    console.error("[vestige:agents:synthesis-validation-failed]", modelValidationLog({
      raw: generated.raw,
      parsed: generated.parsed,
      repaired: generated.repaired,
      repairSteps: generated.repairSteps,
      issues: parsed.error.flatten(),
    }));

    return synthesizeFromContributions(input, contributions);
  }

  private async generateContributions(evidence: EvidenceSnapshot): Promise<AgentContribution[]> {
    const results = await mapWithConcurrency(
      VESTIGE_AGENT_PROFILES,
      Math.min(AGENT_CONCURRENCY, VESTIGE_AGENT_PROFILES.length),
      async (profile, index) => {
        if (index > 0 && AGENT_QUEUE_DELAY_MS > 0) {
          await sleep(index * AGENT_QUEUE_DELAY_MS);
        }

        return this.generateContribution(profile, evidence).catch((error) => {
          console.warn("[vestige:agents:contribution-degraded]", {
            agent: profile.name,
            error: error instanceof Error ? error.message : "unknown error",
          });
          return fallbackContribution(profile, evidence, error);
        });
      },
    );

    return results;
  }

  private async generateContribution(
    profile: VestigeAgentProfile,
    evidence: EvidenceSnapshot,
  ): Promise<AgentContribution> {
    const generated = await generateModelJson(this.groqClient, {
      model: GROQ_LIGHTWEIGHT_MODEL,
      temperature: 0.25,
      maxTokens: AGENT_MAX_TOKENS,
      maxAttempts: 3,
      messages: [
        {
          role: "system",
          content: buildContributionSystemPrompt(profile),
        },
        {
          role: "user",
          content: buildContributionUserPrompt(profile, evidence),
        },
      ],
    }).catch((error) => {
      throw new VestigeError(
        `${profile.name} failed to generate a live contribution: ${error instanceof Error ? error.message : "unknown error"}`,
        "AGENT_GENERATION_FAILED",
      );
    });

    const normalized = normalizeAgentContribution(profile, generated.parsed);
    const parsed = agentContributionSchema.safeParse(normalized);
    if (!parsed.success) {
      console.error("[vestige:agents:contribution-validation-failed]", modelValidationLog({
        agent: profile.name,
        raw: generated.raw,
        parsed: generated.parsed,
        normalizedContribution: normalized,
        repaired: generated.repaired,
        repairSteps: generated.repairSteps,
        issues: parsed.error.flatten(),
      }));
      throw new VestigeError(`${profile.name} returned an invalid structured contribution.`, "AGENT_OUTPUT_INVALID");
    }

    const contribution = dedupeContributionEvidence({
      agent: profile.name,
      specialty: profile.specialty,
      stance: parsed.data.stance,
      confidence: parsed.data.confidence,
      observation: parsed.data.observation,
      inference: parsed.data.inference,
      evidence: parsed.data.evidence,
      verdict: parsed.data.verdict,
      reasoning: parsed.data.reasoning,
      key_risks: parsed.data.key_risks,
      opportunities: parsed.data.opportunities,
      recommendation: parsed.data.recommendation,
    });

    return {
      ...contribution,
    };
  }
}

export function createAgentRunner(): AgentRunner {
  return new DefaultAgentRunner();
}

async function generateModelJson(client: GroqClient, input: GroqGenerateJsonInput): Promise<GroqGenerateJsonResult> {
  if (client.generateJsonResult) return client.generateJsonResult(input);
  const parsed = await client.generateJson(input);
  return {
    parsed,
    raw: safeJsonStringify(parsed),
    repaired: false,
    repairSteps: ["client returned parsed JSON only"],
  };
}

function normalizeAgentContribution(
  profile: VestigeAgentProfile,
  value: unknown,
): Partial<z.infer<typeof agentContributionSchema>> {
  if (!isRecord(value) || !hasContributionSignal(value)) return {};

  const record = value;

  const verdict = normalizeVerdictAction(
    pickFirst(record, ["verdict", "action", "decision", "recommendation_verdict", "final_verdict"]),
  );
  const confidence = normalizeConfidence(pickFirst(record, ["confidence", "conviction", "confidence_level", "probability"]));
  const stance = normalizeStance(pickFirst(record, ["stance", "side", "bias", "position", "direction"]), verdict);

  const reasoning = normalizeText(
    pickFirst(record, ["reasoning", "rationale", "analysis", "thesis", "explanation"]),
  );
  const recommendation = normalizeText(
    pickFirst(record, ["recommendation", "recommended_action", "action_plan", "call_to_action"]),
  );
  const observation = normalizeText(
    pickFirst(record, ["observation", "observations", "market_observation", "summary"]),
  ) || firstSentence(reasoning) || `${profile.name} evaluated the supplied market context from its ${profile.specialty} perspective.`;
  const inference = normalizeText(
    pickFirst(record, ["inference", "implication", "conclusion", "takeaway"]),
  ) || recommendation || reasoning || `${profile.name} recommends ${verdict.toLowerCase()} from its specialist mandate.`;

  const keyRisks = normalizeStringArray(
    pickFirst(record, ["key_risks", "risks", "risk", "downside", "invalidation"]),
  );
  const opportunities = normalizeStringArray(
    pickFirst(record, ["opportunities", "opportunity", "catalysts", "upside", "drivers"]),
  );
  const evidence = normalizeStringArray(
    pickFirst(record, ["evidence", "supporting_evidence", "signals", "data_points", "references"]),
  );

  const fallbackRisks = keyRisks.length > 0 ? keyRisks : [`${profile.name}: missing domain confirmation remains a risk.`];
  const fallbackOpportunities = opportunities.length > 0 ? opportunities : [`${profile.name}: no domain-specific opportunity confirmed without more evidence.`];
  const mergedEvidence = [
    ...evidence,
    ...fallbackOpportunities.slice(0, 2),
    ...fallbackRisks.slice(0, 2),
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 5);

  return {
    stance,
    confidence,
    observation: ensureMinText(observation, `${profile.name} observation`),
    inference: ensureMinText(inference, `${profile.name} inference`),
    evidence: ensureArrayLength(mergedEvidence, [
      `${profile.name}: supplied context reviewed`,
      `${profile.name}: missing or incomplete signal treated as risk`,
    ], 2, 5),
    verdict,
    reasoning: ensureMinText(reasoning || `${observation} ${inference}`, `${profile.name} reasoning`),
    key_risks: ensureArrayLength(fallbackRisks, [`${profile.name}: unresolved risk signal`], 1, 6),
    opportunities: ensureArrayLength(fallbackOpportunities, [`${profile.name}: no clear opportunity without confirmation`], 1, 6),
    recommendation: ensureMinText(recommendation || inference, `${profile.name} recommendation`),
  };
}

function dedupeContributionEvidence(contribution: AgentContribution): AgentContribution {
  return {
    ...contribution,
    observation: limitSentence(contribution.observation, 240),
    inference: limitSentence(contribution.inference, 260),
    evidence: dedupeTextList(contribution.evidence, 3),
    reasoning: limitSentence(contribution.reasoning, 320),
    key_risks: dedupeTextList(contribution.key_risks, 3),
    opportunities: dedupeTextList(contribution.opportunities, 3),
    recommendation: limitSentence(contribution.recommendation, 220),
  };
}

function buildSynthesisPrompt(agent: Agent): string {
  return [
    agent.systemPrompt,
    "Final portfolio committee synthesizer. Produce dense JSON, no filler.",
    "Use only supplied evidence. Do not invent prices, levels, catalysts, macro events, funding, dominance, or history.",
    "Merge duplicate evidence; preserve real disagreement.",
    "Keep each reasoning step to one short observation, one short inference, and 1-2 evidence refs.",
    JSON_ONLY_RESPONSE_RULES,
    "Shape:",
    JSON.stringify({
      thesis: "string",
      reasoningSteps: [{ order: 0, title: "string", observation: "string", inference: "string", evidence: ["string"] }],
      risks: ["string"],
      catalysts: ["string"],
      confidence: "low | medium | high",
      positionIntent: {
        side: "long | short | neutral",
        entry: 0,
        target: 0,
        stopLoss: 0,
        timeHorizon: "intraday | swing | long-term",
      },
      verdict: {
        action: "Momentum Favors Continuation | Structure Weakening | Conviction Divergence | Liquidity Trap Risk | Expansion Setup | Fragile Breakout | High Beta Rotation | Regime Shift Watch",
        summary: "string",
        confidence: "low | medium | high",
        score: 0,
        primaryDrivers: ["string"],
        invalidation: ["string"],
      },
    }),
    `Use 6 steps: Macro, Sentiment, Technical, Risk, Catalyst, Committee synthesis. Verdict action must be one of: ${POSITIONING_ACTIONS.join(", ")}.`,
  ].join("\n");
}

function buildContributionSystemPrompt(profile: VestigeAgentProfile): string {
  return [
    profile.systemPrompt,
    JSON_ONLY_RESPONSE_RULES,
    "Output contract:",
    AGENT_CONTRIBUTION_RESPONSE_CONTRACT,
    `verdict one of: ${POSITIONING_ACTIONS.join(", ")}.`,
    "Use only supplied evidence. Missing signal is valid evidence. Do not invent levels, events, funding, dominance, or macro data.",
    "Keep observation/inference/reasoning/recommendation concise; evidence 2-3 items; risks/opportunities 1-3 each.",
  ].join("\n");
}

function buildContributionUserPrompt(profile: VestigeAgentProfile, evidence: EvidenceSnapshot): string {
  return JSON.stringify({
    task: `${profile.name} memo`,
    agent: profile.slug,
    specialization: agentSpecializationDirective(profile),
    evidence,
  });
}

function agentSpecializationDirective(profile: VestigeAgentProfile): string {
  if (profile.slug === "macro-agent") {
    return "Focus only on liquidity, rates, ETF flows, monetary conditions, dollar strength, and cycle regime. No social or chart reasoning.";
  }
  if (profile.slug === "sentiment-agent") {
    return "Focus only on crowd positioning, funding, fear/euphoria, attention, and narrative momentum. No macro or technical reasoning except divergence signals.";
  }
  if (profile.slug === "technical-agent") {
    return "Focus only on structure, trend, support/resistance, breakout thresholds, confirmation levels, and invalidation. Keep it chart-specific and explicit.";
  }
  if (profile.slug === "risk-agent") {
    return "Focus only on downside, volatility expansion, liquidity collapse, liquidation cascades, correlation breakdowns, and structural risk. Challenge bullish assumptions.";
  }
  if (profile.slug === "catalyst-agent") {
    return "Focus only on forward catalysts, unlocks, launches, upgrades, governance, deadlines, and event timing. Penalize vague narratives.";
  }
  return profile.specialty;
}

function buildEvidenceSnapshot(input: RunAgentRequest): EvidenceSnapshot {
  const snapshot = input.context?.marketSnapshot;
  const live = compactLiveSnapshot(snapshot, input.context?.price);
  const context = compactMarketData(input.context?.marketData);
  const headlines = compactHeadlines(input.context?.headlines);
  const signals = compactSignals(live, context, headlines);
  const missing = missingSignals(profileAgnosticRequiredSignals(live, context, headlines));

  return {
    market: limitSentence(input.market, 80),
    assetSymbol: input.assetSymbol.toUpperCase(),
    live,
    headlines,
    context,
    signals,
    missing,
  };
}

function compactLiveSnapshot(snapshot: MarketSnapshot | undefined, fallbackPrice: number | undefined): EvidenceSnapshot["live"] {
  if (!snapshot) {
    return Number.isFinite(fallbackPrice)
      ? { price: fallbackPrice, quoteAsset: "USD" }
      : {};
  }

  return compactRecord({
    price: snapshot.price,
    quoteAsset: snapshot.quoteAsset,
    change24hPercent: snapshot.change24hPercent,
    volume24h: snapshot.volume24h,
    liquidityUsd: snapshot.liquidityUsd,
    high24h: snapshot.high24h,
    low24h: snapshot.low24h,
    volatility24h: snapshot.volatility24h,
    marketStructure: snapshot.marketStructure,
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
  }) as EvidenceSnapshot["live"];
}

function compactMarketData(marketData: Record<string, unknown> | undefined): EvidenceSnapshot["context"] {
  if (!marketData) return {};

  const omitted = new Set(["wallet", "marketSnapshot", "sources", "raw", "debug", "traceHistory", "history"]);
  const result: EvidenceSnapshot["context"] = {};

  for (const [key, value] of Object.entries(marketData)) {
    if (Object.keys(result).length >= MAX_CONTEXT_FIELDS || omitted.has(key)) continue;
    const compact = compactScalar(value);
    if (compact === undefined) continue;
    result[key] = compact;
  }

  return result;
}

function compactHeadlines(headlines: string[] | undefined): string[] {
  return dedupeTextList((headlines ?? []).map((headline) => limitSentence(headline, MAX_HEADLINE_CHARS)), MAX_HEADLINES);
}

function compactSignals(
  live: EvidenceSnapshot["live"],
  context: EvidenceSnapshot["context"],
  headlines: string[],
): string[] {
  const signals = [
    live.price !== undefined ? `price=${live.price}${live.quoteAsset ? ` ${live.quoteAsset}` : ""}` : "",
    live.change24hPercent !== undefined ? `24hChange=${live.change24hPercent}%` : "",
    live.volume24h !== undefined ? `volume24h=${live.volume24h}` : "",
    live.liquidityUsd !== undefined ? `liquidityUsd=${live.liquidityUsd}` : "",
    live.volatility24h !== undefined ? `volatility24h=${live.volatility24h}` : "",
    live.marketStructure ? `structure=${live.marketStructure}` : "",
    headlines.length > 0 ? `headlines=${headlines.length}` : "",
    ...Object.entries(context)
      .filter(([key]) => !["livePrice", "source", "fetchedAt"].includes(key))
      .slice(0, 6)
      .map(([key, value]) => `${key}=${value}`),
  ];

  return dedupeTextList(signals.filter(Boolean), 10);
}

function profileAgnosticRequiredSignals(
  live: EvidenceSnapshot["live"],
  context: EvidenceSnapshot["context"],
  headlines: string[],
): Record<string, boolean> {
  return {
    livePrice: live.price !== undefined,
    volume24h: live.volume24h !== undefined,
    liquidityUsd: live.liquidityUsd !== undefined,
    volatility24h: live.volatility24h !== undefined || live.change24hPercent !== undefined,
    highLow24h: live.high24h !== undefined && live.low24h !== undefined,
    headlines: headlines.length > 0,
    funding: hasContextKey(context, "funding"),
    dominance: hasContextKey(context, "dominance"),
    macro: hasContextKey(context, "macro") || hasContextKey(context, "rates") || hasContextKey(context, "dollar"),
    datedCatalysts: headlines.some((headline) => /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|deadline|launch|unlock|vote|upgrade|etf)\b/i.test(headline)),
  };
}

function missingSignals(required: Record<string, boolean>): string[] {
  return Object.entries(required)
    .filter(([, present]) => !present)
    .map(([key]) => key)
    .slice(0, 8);
}

function hasContextKey(context: EvidenceSnapshot["context"], fragment: string): boolean {
  return Object.keys(context).some((key) => key.toLowerCase().includes(fragment));
}

function compactRecord(record: Record<string, unknown>): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, compactScalar(value)] as const)
      .filter((entry): entry is readonly [string, string | number | boolean] => entry[1] !== undefined),
  );
}

function compactScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? compactNumber(value) : undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = limitSentence(value, MAX_CONTEXT_FIELD_CHARS);
    return text || undefined;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const text = value.map(compactScalar).filter((item) => item !== undefined).join(", ");
    return text ? limitSentence(text, MAX_CONTEXT_FIELD_CHARS) : undefined;
  }
  if (isRecord(value)) {
    const text = Object.entries(value)
      .slice(0, 4)
      .map(([key, nested]) => {
        const scalar = compactScalar(nested);
        return scalar === undefined ? "" : `${key}:${scalar}`;
      })
      .filter(Boolean)
      .join(", ");
    return text ? limitSentence(text, MAX_CONTEXT_FIELD_CHARS) : undefined;
  }
  return undefined;
}

function compactNumber(value: number): number {
  if (Math.abs(value) >= 1000) return Number(value.toFixed(2));
  if (Math.abs(value) >= 1) return Number(value.toFixed(4));
  return Number(value.toFixed(8));
}

function compactContributionsForSynthesis(contributions: AgentContribution[]): Array<Record<string, unknown>> {
  return contributions.map((contribution) => ({
    agent: contribution.agent.replace(" Agent", ""),
    stance: contribution.stance,
    confidence: contribution.confidence,
    verdict: contribution.verdict,
    observation: contribution.observation,
    inference: contribution.inference,
    evidence: contribution.evidence.slice(0, 3),
    risks: contribution.key_risks.slice(0, 2),
    opportunities: contribution.opportunities.slice(0, 2),
    recommendation: contribution.recommendation,
  }));
}

function modelValidationLog(input: {
  agent?: string;
  raw: string;
  parsed: unknown;
  normalizedContribution?: unknown;
  repaired: boolean;
  repairSteps: string[];
  issues: unknown;
}): Record<string, unknown> {
  if (process.env.NODE_ENV === "production") {
    return {
      agent: input.agent,
      rawLength: input.raw.length,
      repaired: input.repaired,
      repairStepCount: input.repairSteps.length,
      issues: input.issues,
    };
  }

  return {
    agent: input.agent,
    rawModelResponse: input.raw,
    parsedModelResponse: input.parsed,
    normalizedContribution: input.normalizedContribution,
    repaired: input.repaired,
    repairSteps: input.repairSteps,
    issues: input.issues,
  };
}

function fallbackContribution(
  profile: VestigeAgentProfile,
  evidence: EvidenceSnapshot,
  error: unknown,
): AgentContribution {
  const live = evidence.live.price
    ? `${evidence.assetSymbol} live price ${evidence.live.price}${evidence.live.quoteAsset ? ` ${evidence.live.quoteAsset}` : ""}`
    : `${evidence.assetSymbol} live price unavailable`;
  const reason = error instanceof VestigeError
    ? error.code
    : error instanceof Error
      ? error.message
      : "agent unavailable";
  const missing = evidence.missing.length > 0 ? `Missing signals: ${evidence.missing.slice(0, 4).join(", ")}.` : "No supplied missing-signal flags.";

  return dedupeContributionEvidence({
    agent: profile.name,
    specialty: profile.specialty,
    stance: "neutral",
    confidence: "low",
    observation: `${profile.name} degraded: ${live}; ${missing}`,
    inference: `${profile.name} cannot add high-conviction signal after model failure, so committee weight is defensive.`,
    evidence: [live, missing],
    verdict: "Conviction Divergence",
    reasoning: `Contribution degraded because ${reason}. Treat the missing specialist view as uncertainty, not confirmation.`,
    key_risks: [`${profile.name} unavailable; domain risk may be under-specified.`],
    opportunities: [`${profile.name} can be rerun when model capacity recovers.`],
    recommendation: "Do not raise conviction from this domain until the specialist contribution is regenerated.",
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return results;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function synthesizeFromContributions(input: RunAgentRequest, contributions: AgentContribution[]): GeneratedTraceBody {
  const price = typeof input.context?.price === "number" ? input.context.price : undefined;
  const longVotes = contributions.filter((c) => c.stance === "long").length;
  const shortVotes = contributions.filter((c) => c.stance === "short").length;
  const neutralVotes = contributions.length - longVotes - shortVotes;
  const side: ReasoningTrace["positionIntent"]["side"] =
    longVotes > shortVotes + 1 ? "long" : shortVotes > longVotes + 1 ? "short" : "neutral";
  const confidence: ReasoningTrace["confidence"] =
    Math.abs(longVotes - shortVotes) >= 3 ? "high" : Math.abs(longVotes - shortVotes) >= 1 ? "medium" : "low";
  const entry = price;
  const target = price ? Number((side === "short" ? price * 0.92 : price * 1.12).toFixed(2)) : undefined;
  const stopLoss = price ? Number((side === "short" ? price * 1.05 : price * 0.94).toFixed(2)) : undefined;
  const positionIntent: ReasoningTrace["positionIntent"] = {
    side,
    entry,
    target,
    stopLoss,
    timeHorizon: confidence === "high" ? "swing" : "intraday",
  };
  const catalysts = contributionLines(contributions.filter((item) => item.agent.includes("Catalyst") || item.agent.includes("Macro") || item.agent.includes("Sentiment")));
  const risks = contributionLines(contributions.filter((item) => item.agent.includes("Risk") || item.confidence === "low" || item.stance === "neutral"));
  const uniqueEvidence = selectUniqueEvidence(contributions, 5);
  const marketData = input.context?.marketSnapshot
    ? `${input.assetSymbol.toUpperCase()} at ${input.context.marketSnapshot.price} ${input.context.marketSnapshot.quoteAsset} with ${input.context.marketSnapshot.change24hPercent ?? "unknown"}% 24h change from ${input.context.marketSnapshot.source}`
    : `live ${input.assetSymbol.toUpperCase()} market context was requested but no snapshot was available`;
  const fallbackBody: GeneratedTraceBody = {
    thesis: `${input.assetSymbol.toUpperCase()} screens ${side} after five specialist reviews. Market input: ${marketData}. Vote split: ${longVotes} long, ${shortVotes} short, ${neutralVotes} neutral; dissent is retained in the audit trail.`,
    reasoningSteps: [
      ...contributions.map((contribution, index) => ({
        order: index,
        title: contribution.agent,
        observation: contribution.observation,
        inference: contribution.inference,
        evidence: contribution.evidence,
      })),
      {
        order: contributions.length,
        title: "Committee synthesis",
        observation: `Committee split: ${longVotes} long, ${shortVotes} short, ${neutralVotes} neutral. Highest-quality unique evidence is prioritized over repeated support.`,
        inference: `Positioning remains ${side}, but conviction is gated by disagreement, risk pressure, and whether catalysts or levels confirm the thesis.`,
        evidence: uniqueEvidence.map((item) => `${item.source}: ${item.text}`),
      },
    ],
    catalysts: dedupeTextList(catalysts.length > 0 ? catalysts : contributions.map((item) => `${item.agent}: ${item.inference}`), 4),
    risks: dedupeTextList(risks.length > 0 ? risks : contributions.filter((item) => item.agent.includes("Risk")).map((item) => `${item.agent}: ${item.inference}`), 4),
    confidence,
    positionIntent,
  };

  return finalizeGeneratedTraceBody(fallbackBody, contributions, input);
}

function extractCreatorWalletAddress(marketData: Record<string, unknown> | undefined): string | undefined {
  if (!marketData) return undefined;
  const wallet = marketData.wallet;
  if (!wallet || typeof wallet !== "object") return undefined;
  const address = (wallet as Record<string, unknown>).address;
  return typeof address === "string" && address.trim() ? address : undefined;
}

function finalizeGeneratedTraceBody(
  generated: GeneratedTraceBody,
  contributions: AgentContribution[],
  input: RunAgentRequest,
): GeneratedTraceBody {
  const metrics = computeCommitteeScore(generated, contributions, input);
  const reasoningSteps = normalizeReasoningSteps(generated.reasoningSteps, contributions);
  return {
    ...generated,
    thesis: limitSentence(generated.thesis, 520),
    reasoningSteps,
    risks: dedupeTextList(generated.risks, 6),
    catalysts: dedupeTextList(generated.catalysts, 6),
    confidence: metrics.confidence,
    positionIntent: normalizePositionIntent(generated.positionIntent, metrics.action, input),
    verdict: buildStructuredVerdict({ ...generated, reasoningSteps }, contributions, input, metrics),
    traceMetrics: buildTraceMetrics(metrics),
  };
}

function buildStructuredVerdict(
  generated: GeneratedTraceBody,
  contributions: AgentContribution[],
  input: RunAgentRequest,
  existingMetrics?: CommitteeScoreMetrics,
): ReasoningTrace["verdict"] {
  const metrics = existingMetrics ?? computeCommitteeScore(generated, contributions, input);
  const strongestBullish = selectEvidenceByBias(contributions, "bullish");
  const strongestBearish = selectEvidenceByBias(contributions, "bearish");
  const contradiction = unresolvedContradiction(contributions, metrics);
  const confidenceReason = `Confidence ${metrics.confidence}: alignment ${Math.round(metrics.agreement * 100)}%, disagreement ${Math.round(metrics.disagreement * 100)}%, evidence ${Math.round(metrics.evidenceQuality * 100)}%.`;
  return {
    action: metrics.action,
    summary: `${metrics.action}. Alignment ${qualitativeState(metrics.agreement)}; evidence ${qualitativeState(metrics.evidenceQuality)}; pressure ${qualitativeState(metrics.riskAsymmetry)}; catalyst support ${qualitativeState(metrics.catalystStrength)}.`,
    confidence: metrics.confidence,
    score: metrics.score,
    primaryDrivers: dedupeTextList([
      strongestBullish ? `Strongest bullish evidence: ${strongestBullish}` : "",
      strongestBearish ? `Strongest bearish evidence: ${strongestBearish}` : "",
      contradiction ? `Unresolved contradiction: ${contradiction}` : "",
      confidenceReason,
      ...buildPrimaryDrivers(generated, contributions, metrics),
    ], 6),
    invalidation: dedupeTextList([
      contradiction ? `Resolve contradiction: ${contradiction}` : "",
      confidenceReason,
      ...buildInvalidationDrivers(generated, contributions, metrics),
    ], 5),
  };
}

function computeCommitteeScore(
  generated: GeneratedTraceBody,
  contributions: AgentContribution[],
  input: RunAgentRequest,
): CommitteeScoreMetrics {
  const count = Math.max(contributions.length, 1);
  const stanceValues = contributions.map((item) => stanceValue(item.stance));
  const stanceSum = stanceValues.reduce((sum, value) => sum + value, 0);
  const longVotes = contributions.filter((item) => item.stance === "long").length;
  const shortVotes = contributions.filter((item) => item.stance === "short").length;
  const neutralVotes = contributions.filter((item) => item.stance === "neutral").length;
  const agreement = Math.max(longVotes, shortVotes, neutralVotes) / count;
  const disagreement = 1 - agreement;
  const directionalConviction = Math.min(1, Math.abs(stanceSum) / count);
  const neutralPressure = neutralVotes / count;
  const confidenceValues = contributions.map((item) => confidenceValue(item.confidence));
  const averageConfidence = confidenceValues.reduce((sum, value) => sum + value, 0) / count;
  const confidenceConsistency = 1 - Math.min(1, standardDeviation(confidenceValues) / 0.33);
  const evidenceQuality = average(contributions.map(contributionEvidenceQuality));
  const catalystStrength = Math.min(1, (
    generated.catalysts.length +
    contributions.reduce((sum, item) => sum + item.opportunities.length, 0) +
    (contributions.find((item) => item.agent.includes("Catalyst"))?.confidence === "high" ? 1 : 0)
  ) / 10);
  const uncertainty = Math.min(1, (
    keywordDensity([...generated.risks, ...contributions.flatMap((item) => item.key_risks)], ["missing", "unknown", "uncertain", "insufficient", "thin", "unconfirmed", "mixed"]) +
    contributions.filter((item) => item.confidence === "low").length / count +
    disagreement * 0.6
  ) / 2.2);
  const volatilityRisk = marketVolatilityRisk(input);
  const riskAsymmetry = Math.min(1, (
    generated.risks.length / 8 +
    contributions.reduce((sum, item) => sum + item.key_risks.length, 0) / 24 +
    (isRiskOffVerdict(contributions.find((item) => item.agent.includes("Risk"))?.verdict) ? 0.25 : 0)
  ) / 1.5);
  const sentimentDivergence = sentimentDivergenceScore(contributions);
  const contradictionIntensity = contradictionScore(contributions);
  const uniqueEvidenceQuality = uniqueEvidenceScore(contributions);
  const lowEvidencePenalty = evidenceQuality < 0.35 ? 12 : evidenceQuality < 0.55 ? 6 : 0;
  const riskOffPressure = Math.min(1, contributions.filter((item) => isRiskOffVerdict(item.verdict)).length / count);
  const constructiveSupport = contributions.filter((item) => isConstructiveVerdict(item.verdict)).length / count;

  const rawScore =
    32 +
    agreement * 13 +
    directionalConviction * 17 +
    averageConfidence * 11 +
    confidenceConsistency * 8 +
    evidenceQuality * 12 +
    uniqueEvidenceQuality * 9 +
    catalystStrength * 10 +
    constructiveSupport * 8 -
    disagreement * 17 -
    neutralPressure * 10 -
    uncertainty * 16 -
    volatilityRisk * 9 -
    riskAsymmetry * 18 -
    sentimentDivergence * 6 -
    contradictionIntensity * 12 -
    riskOffPressure * 11 -
    lowEvidencePenalty;

  const uncappedScore = Math.max(5, Math.min(96, Math.round(rawScore)));
  const scoreCap = generated.positionIntent.side === "neutral" || neutralPressure >= 0.6
    ? 50
    : directionalConviction < 0.35
      ? 62
      : 94;
  const score = Math.min(uncappedScore, scoreCap);
  const netDirection = Math.sign(stanceSum);
  const action = positioningActionFromMetrics({
    score,
    side: generated.positionIntent.side,
    netDirection,
    agreement,
    directionalConviction,
    riskAsymmetry,
    uncertainty,
    catalystStrength,
    contradictionIntensity,
    riskOffPressure,
    neutralPressure,
  });
  const confidence: ReasoningTrace["confidence"] =
    score >= 76 && disagreement < 0.35 && directionalConviction >= 0.55 && evidenceQuality >= 0.55
      ? "high"
      : score >= 50 && disagreement < 0.65 && directionalConviction >= 0.25 && evidenceQuality >= 0.35
        ? "medium"
        : "low";

  return {
    score,
    confidence,
    action,
    agreement,
    disagreement,
    directionalConviction,
    neutralPressure,
    evidenceQuality,
    catalystStrength,
    uncertainty,
    volatilityRisk,
    riskAsymmetry,
    confidenceConsistency,
    sentimentDivergence,
  };
}

function selectEvidenceByBias(contributions: AgentContribution[], bias: "bullish" | "bearish"): string | undefined {
  const preferred = contributions
    .filter((item) => bias === "bullish" ? item.stance === "long" || isConstructiveVerdict(item.verdict) : item.stance === "short" || isRiskOffVerdict(item.verdict))
    .flatMap((item) => item.evidence.map((evidence) => ({
      evidence,
      score: contributionEvidenceQuality(item) + confidenceValue(item.confidence),
      agent: item.agent,
    })))
    .sort((a, b) => b.score - a.score)[0];

  return preferred ? `${preferred.agent}: ${preferred.evidence}` : undefined;
}

function unresolvedContradiction(contributions: AgentContribution[], metrics: CommitteeScoreMetrics): string | undefined {
  if (metrics.disagreement < 0.35) return undefined;
  const constructive = contributions.find((item) => isConstructiveVerdict(item.verdict) || item.stance === "long");
  const riskOff = contributions.find((item) => isRiskOffVerdict(item.verdict) || item.stance === "short");
  if (!constructive || !riskOff) return undefined;
  return `${constructive.agent} sees ${constructive.inference}; ${riskOff.agent} rejects it with ${riskOff.inference}`;
}

function buildPrimaryDrivers(
  generated: GeneratedTraceBody,
  contributions: AgentContribution[],
  metrics: CommitteeScoreMetrics,
): string[] {
  const constructive = contributions
    .filter((item) => isConstructiveVerdict(item.verdict) || item.confidence === "high")
    .map((item) => `${item.agent}: ${item.recommendation}`);

  return dedupeTextList([
    `Agent alignment: ${Math.round(metrics.agreement * 100)}%; directional conviction: ${Math.round(metrics.directionalConviction * 100)}%; signal consistency: ${Math.round(metrics.confidenceConsistency * 100)}%.`,
    `Evidence quality: ${Math.round(metrics.evidenceQuality * 100)}%; catalyst strength: ${Math.round(metrics.catalystStrength * 100)}%.`,
    ...generated.catalysts,
    ...constructive,
  ], 4);
}

function buildInvalidationDrivers(
  generated: GeneratedTraceBody,
  contributions: AgentContribution[],
  metrics: CommitteeScoreMetrics,
): string[] {
  return dedupeTextList([
    `Risk drag: ${Math.round(metrics.riskAsymmetry * 100)}%; uncertainty: ${Math.round(metrics.uncertainty * 100)}%; volatility pressure: ${Math.round(metrics.volatilityRisk * 100)}%; neutral pressure: ${Math.round(metrics.neutralPressure * 100)}%.`,
    ...generated.risks,
    ...contributions
      .filter((item) => isRiskOffVerdict(item.verdict) || item.agent.includes("Risk"))
      .flatMap((item) => item.key_risks.map((risk) => `${item.agent}: ${risk}`)),
  ], 4);
}

function buildTraceMetrics(metrics: CommitteeScoreMetrics): ReasoningTrace["traceMetrics"] {
  return {
    marketRegime: regimeLabel(metrics),
    liquidityState: liquidityLabel(metrics),
    volatilityState: volatilityLabel(metrics.volatilityRisk),
    alignment: roundMetric(metrics.agreement),
    pressure: roundMetric(Math.max(metrics.riskAsymmetry, metrics.uncertainty)),
    catalystStrength: roundMetric(metrics.catalystStrength),
    disagreement: roundMetric(metrics.disagreement),
    convictionTemperature: convictionTemperature(metrics.score),
  };
}

function accessTierFromVerdict(verdict: NonNullable<ReasoningTrace["verdict"]>): ReasoningTrace["accessTier"] {
  if (verdict.action === "Expansion Setup" || verdict.action === "High Beta Rotation" || verdict.score >= 81) return "institutional";
  if (verdict.score >= 61 || verdict.action === "Momentum Favors Continuation" || verdict.action === "Fragile Breakout") return "premium";
  return "public";
}

function qualitativeState(value: number): string {
  if (value >= 0.75) return "high";
  if (value >= 0.5) return "moderate";
  if (value >= 0.25) return "thin";
  return "low";
}

function convictionTemperature(score: number): string {
  if (score <= 20) return "cold";
  if (score <= 40) return "defensive";
  if (score <= 60) return "balanced";
  if (score <= 80) return "warming";
  return "hot";
}

function regimeLabel(metrics: CommitteeScoreMetrics): string {
  if (metrics.riskAsymmetry >= 0.7 || metrics.volatilityRisk >= 0.7) return "stress";
  if (metrics.disagreement >= 0.55 || metrics.neutralPressure >= 0.45) return "two-way";
  if (metrics.catalystStrength >= 0.65 && metrics.agreement >= 0.65) return "expansion";
  return "selective";
}

function liquidityLabel(metrics: CommitteeScoreMetrics): string {
  if (metrics.uncertainty >= 0.7 || metrics.riskAsymmetry >= 0.7) return "fragile";
  if (metrics.evidenceQuality >= 0.65 && metrics.agreement >= 0.6) return "supportive";
  return "mixed";
}

function volatilityLabel(value: number): string {
  if (value >= 0.7) return "elevated";
  if (value >= 0.4) return "active";
  return "contained";
}

function roundMetric(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function contributionLines(contributions: AgentContribution[]): string[] {
  return dedupeTextList(contributions
    .map((contribution) => `${contribution.agent}: ${contribution.inference}`)
    .filter(Boolean), 4);
}

function stanceValue(stance: ReasoningTrace["positionIntent"]["side"]): number {
  if (stance === "long") return 1;
  if (stance === "short") return -1;
  return 0;
}

function confidenceValue(confidence: ReasoningTrace["confidence"]): number {
  if (confidence === "high") return 1;
  if (confidence === "medium") return 0.62;
  return 0.28;
}

function contributionEvidenceQuality(contribution: AgentContribution): number {
  const countScore = Math.min(1, contribution.evidence.length / 4);
  const specificityScore = average(
    contribution.evidence.map((item) => /(\d|%|\$|usdc|volume|price|support|resistance|funding|liquidity|deadline|unlock|upgrade|etf|rate|dollar)/i.test(item) ? 1 : 0.35),
  );
  const reasoningScore = contribution.reasoning.length > 180 ? 1 : contribution.reasoning.length > 80 ? 0.65 : 0.35;
  return Math.min(1, countScore * 0.4 + specificityScore * 0.4 + reasoningScore * 0.2);
}

function sentimentDivergenceScore(contributions: AgentContribution[]): number {
  const sentiment = contributions.find((item) => item.agent.includes("Sentiment"));
  if (!sentiment) return 0;
  const others = contributions.filter((item) => item !== sentiment);
  if (others.length === 0) return 0;
  const majority = Math.sign(others.reduce((sum, item) => sum + stanceValue(item.stance), 0));
  if (majority === 0 || stanceValue(sentiment.stance) === 0) return 0.25;
  return Math.sign(stanceValue(sentiment.stance)) === majority ? 0 : confidenceValue(sentiment.confidence);
}

function marketVolatilityRisk(input: RunAgentRequest): number {
  const snapshot = input.context?.marketSnapshot;
  if (!snapshot?.price) return 0.35;
  if (snapshot.volatility24h !== undefined) return Math.min(1, snapshot.volatility24h * 3);
  const intradayRange = snapshot.high24h && snapshot.low24h
    ? Math.abs(snapshot.high24h - snapshot.low24h) / snapshot.price
    : 0;
  const change = Math.abs(snapshot.change24hPercent ?? 0) / 100;
  return Math.min(1, intradayRange * 4 + change * 2);
}

function positioningActionFromMetrics(input: PositioningDecisionInput): VerdictAction {
  const blockedByRisk = input.riskAsymmetry >= 0.72 || input.riskOffPressure >= 0.4;
  const conflicted = input.contradictionIntensity >= 0.55 || input.neutralPressure >= 0.55;

  if (input.uncertainty >= 0.82 || (conflicted && input.score < 32)) return "Liquidity Trap Risk";
  if (input.score <= 35 || blockedByRisk || input.riskAsymmetry >= 0.6) return "Structure Weakening";
  if (input.neutralPressure >= 0.45 || input.directionalConviction < 0.3) return "Conviction Divergence";
  if (input.score <= 62 || conflicted) return "Regime Shift Watch";
  if (input.catalystStrength < 0.45 || input.agreement < 0.6) return "Fragile Breakout";
  if (input.score >= 84 && input.directionalConviction >= 0.6) return "Expansion Setup";
  if (input.netDirection > 0 && input.score >= 72) return "Momentum Favors Continuation";
  return "High Beta Rotation";
}

function isConstructiveVerdict(verdict?: VerdictAction): boolean {
  return verdict === "Momentum Favors Continuation" ||
    verdict === "Expansion Setup" ||
    verdict === "Fragile Breakout" ||
    verdict === "High Beta Rotation";
}

function isRiskOffVerdict(verdict?: VerdictAction): boolean {
  return verdict === "Structure Weakening" || verdict === "Liquidity Trap Risk";
}

function contradictionScore(contributions: AgentContribution[]): number {
  if (contributions.length <= 1) return 0;
  const stanceSpread = Math.abs(
    Math.max(...contributions.map((item) => stanceValue(item.stance))) -
    Math.min(...contributions.map((item) => stanceValue(item.stance))),
  ) / 2;
  const highConfidenceOpposition = contributions.some((a) =>
    a.confidence === "high" &&
    contributions.some((b) => b !== a && b.confidence !== "low" && stanceValue(a.stance) * stanceValue(b.stance) < 0),
  ) ? 0.35 : 0;
  const riskOpposesLong = contributions.some((item) => item.agent.includes("Risk") && isRiskOffVerdict(item.verdict)) &&
    contributions.some((item) => isConstructiveVerdict(item.verdict))
    ? 0.25
    : 0;
  return Math.min(1, stanceSpread * 0.45 + highConfidenceOpposition + riskOpposesLong);
}

function uniqueEvidenceScore(contributions: AgentContribution[]): number {
  const all = contributions.flatMap((item) => item.evidence);
  if (all.length === 0) return 0;
  const unique = dedupeTextList(all, all.length);
  return Math.min(1, unique.length / all.length + Math.min(unique.length, 8) / 24);
}

function selectUniqueEvidence(contributions: AgentContribution[], limit: number): EvidenceFragment[] {
  const fragments = contributions.flatMap((contribution) =>
    contribution.evidence.map((text) => ({
      text,
      source: contribution.agent,
      weight: contributionEvidenceQuality(contribution) + confidenceValue(contribution.confidence) * 0.25,
    })),
  );

  const seen = new Set<string>();
  return fragments
    .sort((a, b) => b.weight - a.weight)
    .filter((item) => {
      const key = evidenceKey(item.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function keywordDensity(values: string[], keywords: string[]): number {
  if (values.length === 0) return 0.5;
  const matches = values.filter((value) => keywords.some((keyword) => value.toLowerCase().includes(keyword))).length;
  return matches / values.length;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function normalizeConfidence(value: unknown): ReasoningTrace["confidence"] {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = value > 1 ? value / 100 : value;
    if (normalized >= 0.75) return "high";
    if (normalized >= 0.45) return "medium";
    return "low";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    const numeric = Number.parseFloat(normalized.replace("%", ""));
    if (Number.isFinite(numeric) && /\d/.test(normalized)) {
      return normalizeConfidence(normalized.includes("%") || numeric > 1 ? numeric / 100 : numeric);
    }

    if (["high", "strong", "elevated", "confident", "conviction", "certain"].some((item) => normalized.includes(item))) return "high";
    if (["medium", "moderate", "balanced", "mixed", "neutral", "base"].some((item) => normalized.includes(item))) return "medium";
    if (["low", "weak", "uncertain", "limited", "poor"].some((item) => normalized.includes(item))) return "low";
  }

  return "medium";
}

function normalizeVerdictAction(value: unknown): NonNullable<ReasoningTrace["verdict"]>["action"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return "Conviction Divergence";
  if (normalized.includes("liquidity trap") || normalized.includes("avoid") || normalized.includes("no exposure") || normalized.includes("risk off")) return "Liquidity Trap Risk";
  if (normalized.includes("structure weakening") || normalized.includes("defensive") || normalized.includes("protect") || normalized.includes("hedge")) return "Structure Weakening";
  if (normalized.includes("conviction divergence") || normalized.includes("range") || normalized.includes("wait") || normalized.includes("neutral") || normalized.includes("stand aside")) return "Conviction Divergence";
  if (normalized.includes("regime shift")) return "Regime Shift Watch";
  if (normalized.includes("fragile") || normalized.includes("breakout")) return "Fragile Breakout";
  if (normalized.includes("high beta") || normalized.includes("rotation")) return "High Beta Rotation";
  if (normalized.includes("momentum") || normalized.includes("accum") || normalized.includes("build") || normalized.includes("tactical long") || normalized.includes("long")) return "Momentum Favors Continuation";
  if (normalized.includes("expansion") || normalized.includes("high-conv") || normalized.includes("high conviction") || normalized.includes("aggressive")) return "Expansion Setup";
  return "Conviction Divergence";
}

function normalizeStance(
  value: unknown,
  verdict: NonNullable<ReasoningTrace["verdict"]>["action"],
): ReasoningTrace["positionIntent"]["side"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized.includes("short") || normalized.includes("bear") || normalized.includes("downside")) return "short";
  if (normalized.includes("long") || normalized.includes("bull") || normalized.includes("upside")) return "long";
  if (normalized.includes("neutral") || normalized.includes("flat") || normalized.includes("wait")) return "neutral";
  if (isConstructiveVerdict(verdict)) return "long";
  if (isRiskOffVerdict(verdict)) return "neutral";
  return "neutral";
}

function pickFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function hasContributionSignal(record: Record<string, unknown>): boolean {
  const expectedKeys = [
    "verdict",
    "action",
    "decision",
    "confidence",
    "conviction",
    "reasoning",
    "analysis",
    "recommendation",
    "key_risks",
    "risks",
    "opportunities",
    "catalysts",
    "observation",
    "inference",
  ];

  return expectedKeys.some((key) => record[key] !== undefined);
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") return stripMarkdownArtifacts(value).trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(" ");
  if (isRecord(value)) return Object.values(value).map(normalizeText).filter(Boolean).join(" ");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStringArray(item));
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap((item) => normalizeStringArray(item));
  }

  const text = normalizeText(value);
  if (!text) return [];

  return text
    .split(/\n+|(?:^|\s)(?:[-*•]|\d+[.)])\s+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeReasoningSteps(steps: ReasoningStep[], contributions: AgentContribution[]): ReasoningStep[] {
  const fallbackByTitle = new Map(contributions.map((item) => [item.agent, item]));
  const seenEvidence = new Set<string>();
  const sourceSteps = steps.length > 0
    ? steps
    : contributions.map((contribution, index) => ({
      order: index,
      title: contribution.agent,
      observation: contribution.observation,
      inference: contribution.inference,
      evidence: contribution.evidence,
    }));

  return sourceSteps
    .slice(0, 8)
    .map((step, index) => {
      const contribution = fallbackByTitle.get(step.title);
      const evidence = dedupeTextList(step.evidence ?? contribution?.evidence ?? [], 4)
        .filter((item) => {
          const key = evidenceKey(item);
          if (seenEvidence.has(key)) return false;
          seenEvidence.add(key);
          return true;
        });

      return {
        order: index,
        title: limitSentence(step.title || contribution?.agent || `Step ${index + 1}`, 80),
        observation: limitSentence(step.observation || contribution?.observation || "Specialist observation unavailable.", 360),
        inference: limitSentence(step.inference || contribution?.inference || "Inference unavailable.", 420),
        evidence,
      };
    });
}

function normalizePositionIntent(
  intent: ReasoningTrace["positionIntent"],
  action: VerdictAction,
  input: RunAgentRequest,
): ReasoningTrace["positionIntent"] {
  const side = isConstructiveVerdict(action)
    ? (intent.side === "neutral" ? "long" : intent.side)
    : isRiskOffVerdict(action)
      ? (intent.side === "short" ? "short" : "neutral")
      : intent.side;

  const livePrice = input.context?.marketSnapshot?.price ?? input.context?.price;
  const volatilityBand = Math.max(0.025, Math.min(0.18, (input.context?.marketSnapshot?.volatility24h ?? 0.04) * 2.5));
  const entry = normalizeLiveLevel(intent.entry, livePrice, 0.35) ?? livePrice;
  const target = side === "short"
    ? normalizeLiveLevel(intent.target, livePrice, 0.45) ?? (livePrice ? Number((livePrice * (1 - volatilityBand)).toFixed(2)) : undefined)
    : side === "long"
      ? normalizeLiveLevel(intent.target, livePrice, 0.45) ?? (livePrice ? Number((livePrice * (1 + volatilityBand)).toFixed(2)) : undefined)
      : normalizeLiveLevel(intent.target, livePrice, 0.35);
  const stopLoss = side === "short"
    ? normalizeLiveLevel(intent.stopLoss, livePrice, 0.45) ?? (livePrice ? Number((livePrice * (1 + volatilityBand * 0.55)).toFixed(2)) : undefined)
    : side === "long"
      ? normalizeLiveLevel(intent.stopLoss, livePrice, 0.45) ?? (livePrice ? Number((livePrice * (1 - volatilityBand * 0.55)).toFixed(2)) : undefined)
      : normalizeLiveLevel(intent.stopLoss, livePrice, 0.35);

  return {
    ...intent,
    side,
    entry,
    target,
    stopLoss,
    timeHorizon: intent.timeHorizon ?? "swing",
  };
}

function normalizeLiveLevel(level: number | undefined, livePrice: number | undefined, maxDeviation: number): number | undefined {
  if (!Number.isFinite(level)) return undefined;
  if (!Number.isFinite(livePrice) || !livePrice) return level;
  return Math.abs((level as number) - livePrice) / livePrice <= maxDeviation ? level : undefined;
}

function dedupeTextList(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = stripMarkdownArtifacts(value).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = evidenceKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(limitSentence(text, 260));
    if (result.length >= max) break;
  }
  return result;
}

function evidenceKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%$.\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !["agent", "market", "signal", "context", "price", "trade"].includes(word))
    .slice(0, 10)
    .join(" ");
}

function limitSentence(value: string, max: number): string {
  const text = stripMarkdownArtifacts(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trim()}...`;
}

function ensureArrayLength(values: string[], fallbacks: string[], min: number, max: number): string[] {
  const merged = [...values, ...fallbacks]
    .map((item) => stripMarkdownArtifacts(item).trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);

  while (merged.length < min) {
    merged.push(fallbacks[merged.length % fallbacks.length] ?? "Signal unavailable.");
  }

  return merged.slice(0, max);
}

function ensureMinText(value: string, fallbackPrefix: string): string {
  const text = stripMarkdownArtifacts(value).trim();
  if (text.length >= 20) return text;
  return `${fallbackPrefix}: ${text || "analysis depends on incomplete supplied market context."}`;
}

function firstSentence(value: string): string {
  const match = value.match(/^[\s\S]*?[.!?](?:\s|$)/);
  return match?.[0]?.trim() ?? value.trim();
}

function stripMarkdownArtifacts(value: string): string {
  return value
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .replace(/<\/?think>/gi, "")
    .replace(/^#+\s*/gm, "")
    .trim();
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
