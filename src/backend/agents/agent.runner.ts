import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GroqHttpClient, type GroqClient, type GroqGenerateJsonInput, type GroqGenerateJsonResult } from "../ai/groq.client";
import { createMarketDataService } from "../markets/market.service";
import type { MarketDataService } from "../markets/market.types";
import { createPositionService, type PositionService } from "../positions/position.service";
import { reasoningTraceSchema } from "../shared/schemas/trace.zod";
import { VestigeError } from "../shared/errors";
import type { RunAgentRequest, RunAgentResponse } from "../shared/types/api";
import type { Agent } from "../shared/types/agent";
import type { ReasoningStep, ReasoningTrace } from "../shared/types/trace";
import { createTraceRepository, type TraceRepository } from "../traces/trace.repository";
import { createTraceService, type TraceService } from "../traces/trace.service";
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

const agentContributionSchema = z
  .object({
    stance: z.enum(["long", "short", "neutral"]),
    confidence: z.enum(["low", "medium", "high"]),
    observation: z.string().min(20),
    inference: z.string().min(20),
    evidence: z.array(z.string().min(1)).min(2).max(5),
    verdict: z.enum(["EXECUTE", "RESTRUCTURE", "KILL"]),
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
      verdict: generatedPayload.verdict ?? buildStructuredVerdict(generatedPayload),
      rawModelOutput: JSON.stringify(generatedPayload),
      status: "stored",
      createdAt: now,
    };

    const validatedTrace = reasoningTraceSchema.parse(candidateTrace);
    const trace = await this.traceService.storeTrace(validatedTrace);
    const position = await this.positionService.createFromTrace(trace);

    return { trace, position };
  }

  private async enrichWithLiveMarketData(input: RunAgentRequest): Promise<RunAgentRequest> {
    if (input.context?.marketSnapshot) return input;

    const snapshot = await this.marketDataService.getSnapshot(input.assetSymbol).catch(() => null);
    if (!snapshot) return input;

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
          fetchedAt: snapshot.fetchedAt,
        },
      },
    };
  }

  private async generateTraceBody(
    agent: Agent,
    input: RunAgentRequest,
  ): Promise<GeneratedTraceBody> {
    const contributions = await Promise.all(
      VESTIGE_AGENT_PROFILES.map((profile) => this.generateContribution(profile, input)),
    );

    const generated = await generateModelJson(this.groqClient, {
      temperature: 0.15,
      maxTokens: 2200,
      messages: [
        {
          role: "system",
          content: buildSynthesisPrompt(agent),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Synthesize a Vestige institutional reasoning trace from five distinct agent memos.",
            market: input.market,
            assetSymbol: input.assetSymbol,
            context: input.context ?? {},
            agentContributions: contributions,
            requiredCoverage: [
              "thesis",
              "market structure",
              "catalysts",
              "risks",
              "volatility",
              "macro conditions",
              "positioning",
              "sentiment",
              "execution bias",
              "scenario analysis",
              "bullish case",
              "bearish case",
              "conviction",
            ],
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
      return parsed.data;
    }

    console.error("[vestige:agents:synthesis-validation-failed]", {
      rawModelResponse: generated.raw,
      parsedModelResponse: generated.parsed,
      repaired: generated.repaired,
      repairSteps: generated.repairSteps,
      issues: parsed.error.flatten(),
    });

    return synthesizeFromContributions(input, contributions);
  }

  private async generateContribution(
    profile: VestigeAgentProfile,
    input: RunAgentRequest,
  ): Promise<AgentContribution> {
    const generated = await generateModelJson(this.groqClient, {
      temperature: 0.25,
      maxTokens: 1100,
      messages: [
        {
          role: "system",
          content: [
            profile.systemPrompt,
            JSON_ONLY_RESPONSE_RULES,
            "Your output must match this exact JSON contract:",
            AGENT_CONTRIBUTION_RESPONSE_CONTRACT,
            "verdict must be EXECUTE, RESTRUCTURE, or KILL from this agent's perspective.",
            "confidence must be exactly low, medium, or high.",
            "reasoning should support longer strategic analysis but stay inside a single JSON string.",
            "key_risks and opportunities must cite supplied live market data, wallet/portfolio context, headline context, or the explicit absence of a required signal.",
            "recommendation must be concrete and compatible with the final Vestige verdict engine.",
            "Be specific, non-repetitive, risk-aware, and institutional.",
          ].join("\n"),
        },
        {
          role: "user",
          content: buildContributionUserPrompt(profile, input),
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
      console.error("[vestige:agents:contribution-validation-failed]", {
        agent: profile.name,
        rawModelResponse: generated.raw,
        parsedModelResponse: generated.parsed,
        normalizedContribution: normalized,
        repaired: generated.repaired,
        repairSteps: generated.repairSteps,
        issues: parsed.error.flatten(),
      });
      throw new VestigeError(`${profile.name} returned an invalid structured contribution.`, "AGENT_OUTPUT_INVALID");
    }

    return {
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
  ) || recommendation || reasoning || `${profile.name} recommends ${verdict.toLowerCase()} with ${confidence} confidence.`;

  const keyRisks = normalizeStringArray(
    pickFirst(record, ["key_risks", "risks", "risk", "downside", "invalidation"]),
  );
  const opportunities = normalizeStringArray(
    pickFirst(record, ["opportunities", "opportunity", "catalysts", "upside", "drivers"]),
  );
  const evidence = normalizeStringArray(
    pickFirst(record, ["evidence", "supporting_evidence", "signals", "data_points", "references"]),
  );

  const fallbackRisks = keyRisks.length > 0 ? keyRisks : [`${profile.name}: ${inference}`];
  const fallbackOpportunities = opportunities.length > 0 ? opportunities : [`${profile.name}: ${recommendation || inference}`];
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

function buildSynthesisPrompt(agent: Agent): string {
  return [
    agent.systemPrompt,
    "You are the final Vestige portfolio committee synthesizer.",
    "Write like an institutional crypto research terminal: concise, specific, risk-aware, and non-generic.",
    "Each reasoning step must represent a different agent perspective or committee synthesis.",
    JSON_ONLY_RESPONSE_RULES,
    "The JSON object must exactly match this shape:",
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
        action: "EXECUTE | RESTRUCTURE | KILL",
        summary: "string",
        confidence: "low | medium | high",
        score: 0,
        primaryDrivers: ["string"],
        invalidation: ["string"],
      },
    }),
    "Include 6 to 8 high-signal reasoning steps covering macro, technical structure, sentiment, risk, catalysts, and final synthesis.",
    "Use EXECUTE only when the setup is actionable with explicit invalidation. Use RESTRUCTURE when the thesis needs reduced size, delayed timing, or changed parameters. Use KILL when the setup should be rejected.",
    "The verdict must be a concise product-facing decision, not a trading guarantee.",
  ].join("\n");
}

function buildUserPrompt(input: RunAgentRequest): string {
  return JSON.stringify({
    task: "Generate a structured market reasoning trace for Vestige.",
    market: input.market,
    assetSymbol: input.assetSymbol,
    context: input.context ?? {},
    constraints: {
      positionIntent:
        "Use neutral if there is insufficient evidence. Use long or short only when the thesis supports a trade.",
      reasoningSteps: "Include 3 to 6 concise reasoning steps.",
      evidence:
        "Reference actual supplied market conditions, volatility, wallet exposure, portfolio concentration, catalysts, or explicit missing-data risks.",
    },
  });
}

function buildContributionUserPrompt(profile: VestigeAgentProfile, input: RunAgentRequest): string {
  return JSON.stringify({
    task: `Generate one structured ${profile.name} contribution for Vestige's multi-agent verdict engine.`,
    agent: {
      name: profile.name,
      specialty: profile.specialty,
      tone: profile.tone,
    },
    market: input.market,
    assetSymbol: input.assetSymbol,
    context: input.context ?? {},
    output_contract: JSON.parse(AGENT_CONTRIBUTION_RESPONSE_CONTRACT) as unknown,
    constraints: {
      verdict: "Use EXECUTE only if this agent sees actionable edge. Use RESTRUCTURE for wait/reduce/adjust. Use KILL for reject/avoid.",
      confidence: "Return low, medium, or high only. Normalize uncertainty into one of these labels.",
      reasoning: "2-5 concise sentences. Explain why, not just what.",
      key_risks: "1-6 specific risks, including missing-data risks when relevant.",
      opportunities: "1-6 specific catalysts/opportunities/positive signals.",
      recommendation: "Concrete next action compatible with portfolio and trace verdict synthesis.",
      json_only: "Return no markdown and no text outside the JSON object.",
    },
  });
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
  const marketData = input.context?.marketSnapshot
    ? `${input.assetSymbol.toUpperCase()} at ${input.context.marketSnapshot.price} ${input.context.marketSnapshot.quoteAsset} with ${input.context.marketSnapshot.change24hPercent ?? "unknown"}% 24h change from ${input.context.marketSnapshot.source}`
    : `live ${input.assetSymbol.toUpperCase()} market context was requested but no snapshot was available`;
  const fallbackBody: GeneratedTraceBody = {
    thesis: `${input.assetSymbol.toUpperCase()} receives a ${side} committee bias with ${confidence} conviction after five independent live-agent reviews. Market input: ${marketData}. Vote split: ${longVotes} long, ${shortVotes} short, ${neutralVotes} neutral.`,
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
        observation: `Consensus: ${longVotes} long, ${shortVotes} short, ${contributions.length - longVotes - shortVotes} neutral across five specialized agents.`,
        inference: `Positioning should remain ${side} with ${confidence} conviction; size should be reduced if volatility expands without confirmation from liquidity or market breadth.`,
        evidence: contributions.flatMap((contribution) => contribution.evidence.slice(0, 1)).slice(0, 5),
      },
    ],
    catalysts: catalysts.length > 0 ? catalysts : contributions.map((item) => `${item.agent}: ${item.inference}`).slice(0, 4),
    risks: risks.length > 0 ? risks : contributions.filter((item) => item.agent.includes("Risk")).map((item) => `${item.agent}: ${item.inference}`).slice(0, 4),
    confidence,
    positionIntent,
  };

  return { ...fallbackBody, verdict: buildStructuredVerdict(fallbackBody) };
}

function buildStructuredVerdict(generated: GeneratedTraceBody): ReasoningTrace["verdict"] {
  const side = generated.positionIntent.side;
  const confidenceScore = generated.confidence === "high" ? 82 : generated.confidence === "medium" ? 62 : 38;
  const riskPenalty = Math.min(generated.risks.length * 3, 18);
  const catalystBoost = Math.min(generated.catalysts.length * 2, 10);
  const score = Math.max(0, Math.min(100, confidenceScore + catalystBoost - riskPenalty));
  const action: NonNullable<ReasoningTrace["verdict"]>["action"] =
    score >= 70 && side !== "neutral" ? "EXECUTE" : score < 40 || (side === "neutral" && generated.confidence === "low") ? "KILL" : "RESTRUCTURE";

  return {
    action,
    summary: `${action}: ${side.toUpperCase()} bias with ${generated.confidence} conviction over a ${generated.positionIntent.timeHorizon} horizon.`,
    confidence: generated.confidence,
    score,
    primaryDrivers: generated.catalysts.slice(0, 4),
    invalidation: generated.risks.slice(0, 4),
  };
}

function contributionLines(contributions: AgentContribution[]): string[] {
  return contributions
    .map((contribution) => `${contribution.agent}: ${contribution.inference}`)
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .slice(0, 4);
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
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized.includes("EXECUTE") || normalized.includes("BUY") || normalized.includes("LONG") || normalized.includes("ACT")) return "EXECUTE";
  if (normalized.includes("KILL") || normalized.includes("REJECT") || normalized.includes("AVOID") || normalized.includes("NO TRADE")) return "KILL";
  return "RESTRUCTURE";
}

function normalizeStance(
  value: unknown,
  verdict: NonNullable<ReasoningTrace["verdict"]>["action"],
): ReasoningTrace["positionIntent"]["side"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized.includes("short") || normalized.includes("bear") || normalized.includes("downside")) return "short";
  if (normalized.includes("long") || normalized.includes("bull") || normalized.includes("upside")) return "long";
  if (normalized.includes("neutral") || normalized.includes("flat") || normalized.includes("wait")) return "neutral";
  return verdict === "EXECUTE" ? "long" : "neutral";
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
