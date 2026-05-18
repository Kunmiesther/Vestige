import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GroqHttpClient, type GroqClient } from "../ai/groq.client";
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
import { VESTIGE_AGENT_PROFILES, type VestigeAgentProfile } from "./agent.prompts";

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
}

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

    const generated = await this.groqClient.generateJson({
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
    }).catch(() => synthesizeFallback(input, contributions));

    const parsed = generatedTraceBodySchema.safeParse(generated);
    if (parsed.success) {
      return parsed.data;
    }

    return synthesizeFallback(input, contributions);
  }

  private async generateContribution(
    profile: VestigeAgentProfile,
    input: RunAgentRequest,
  ): Promise<AgentContribution> {
    const generated = await this.groqClient.generateJson({
      temperature: 0.25,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content: [
            profile.systemPrompt,
            "Return only JSON with keys: stance, confidence, observation, inference, evidence.",
            "Be specific, concise, non-repetitive, and institutional.",
          ].join("\n"),
        },
        {
          role: "user",
          content: buildUserPrompt(input),
        },
      ],
    }).catch(() => null);

    if (generated && typeof generated === "object") {
      const record = generated as Record<string, unknown>;
      return {
        agent: profile.name,
        specialty: profile.specialty,
        stance: asSide(record.stance),
        confidence: asConfidence(record.confidence),
        observation: asText(record.observation, fallbackObservation(profile, input)),
        inference: asText(record.inference, fallbackInference(profile, input)),
        evidence: Array.isArray(record.evidence)
          ? record.evidence.filter((item): item is string => typeof item === "string").slice(0, 3)
          : fallbackEvidence(profile, input),
      };
    }

    return {
      agent: profile.name,
      specialty: profile.specialty,
      stance: fallbackStance(profile, input),
      confidence: "medium",
      observation: fallbackObservation(profile, input),
      inference: fallbackInference(profile, input),
      evidence: fallbackEvidence(profile, input),
    };
  }
}

export function createAgentRunner(): AgentRunner {
  return new DefaultAgentRunner();
}

function buildSynthesisPrompt(agent: Agent): string {
  return [
    agent.systemPrompt,
    "You are the final Vestige portfolio committee synthesizer.",
    "Write like an institutional crypto research terminal: concise, specific, risk-aware, and non-generic.",
    "Each reasoning step must represent a different agent perspective or committee synthesis.",
    "Return only valid JSON.",
    "Do not include markdown, commentary, XML, or chain-of-thought.",
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
        action: "follow | fade | watch | avoid",
        summary: "string",
        confidence: "low | medium | high",
        score: 0,
        primaryDrivers: ["string"],
        invalidation: ["string"],
      },
    }),
    "Include 6 to 8 high-signal reasoning steps covering macro, sentiment, quant, DeFi risk, momentum, and final synthesis.",
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
    },
  });
}

function synthesizeFallback(input: RunAgentRequest, contributions: AgentContribution[]): GeneratedTraceBody {
  const price = typeof input.context?.price === "number" ? input.context.price : undefined;
  const longVotes = contributions.filter((c) => c.stance === "long").length;
  const shortVotes = contributions.filter((c) => c.stance === "short").length;
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
  const catalysts = [
    "ETF or stablecoin liquidity impulse confirms risk appetite.",
    "Clean breakout with rising spot volume and controlled funding.",
    "Narrative acceleration without immediate leverage overheating.",
    "Macro data softens enough to support duration and high-beta crypto exposure.",
  ];
  const risks = [
    "Crowded positioning can turn a valid thesis into a liquidation event.",
    "Weak spot depth or bridge/stablecoin stress would invalidate risk-on assumptions.",
    "Volatility expansion without volume confirmation raises false-breakout risk.",
    "Policy or dollar-strength shock can compress crypto beta quickly.",
  ];
  const fallbackBody: GeneratedTraceBody = {
    thesis: `${input.assetSymbol.toUpperCase()} is best treated as a ${side} / ${confidence}-conviction setup until fresh liquidity or volatility evidence breaks the current regime. The committee sees tradable signal, but the edge depends on disciplined execution rather than headline chasing.`,
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
        evidence: [
          "Bull case: liquidity improves, trend confirms, and narrative attention rotates into the asset.",
          "Bear case: macro impulse tightens, leverage flushes, or breakout demand fails at resistance.",
          "Execution bias: wait for confirmation near defined invalidation rather than chasing the first impulse.",
        ],
      },
    ],
    catalysts,
    risks,
    confidence,
    positionIntent,
  };

  return { ...fallbackBody, verdict: buildStructuredVerdict(fallbackBody) };
}

function buildStructuredVerdict(generated: GeneratedTraceBody): ReasoningTrace["verdict"] {
  const side = generated.positionIntent.side;
  const action = side === "long" ? "follow" : side === "short" ? "fade" : "watch";
  const confidenceScore = generated.confidence === "high" ? 82 : generated.confidence === "medium" ? 62 : 38;
  const riskPenalty = Math.min(generated.risks.length * 3, 18);
  const catalystBoost = Math.min(generated.catalysts.length * 2, 10);

  return {
    action,
    summary: `${side.toUpperCase()} bias with ${generated.confidence} conviction over a ${generated.positionIntent.timeHorizon} horizon.`,
    confidence: generated.confidence,
    score: Math.max(0, Math.min(100, confidenceScore + catalystBoost - riskPenalty)),
    primaryDrivers: generated.catalysts.slice(0, 4),
    invalidation: generated.risks.slice(0, 4),
  };
}

function fallbackObservation(profile: VestigeAgentProfile, input: RunAgentRequest): string {
  const symbol = input.assetSymbol.toUpperCase();
  if (profile.slug.includes("macro")) return `${symbol} is trading inside a regime where dollar liquidity, ETF demand, and rate expectations dominate incremental beta.`;
  if (profile.slug.includes("sentiment")) return `${symbol} attention is narrative-driven; crowd conviction matters as much as price because reflexivity can accelerate both breakouts and failures.`;
  if (profile.slug.includes("quant")) return `${symbol} requires probability-weighted framing: the setup is only attractive if target distance exceeds stop distance after volatility adjustment.`;
  if (profile.slug.includes("defi")) return `${symbol} downside is concentrated around liquidity gaps, leverage resets, stablecoin plumbing, and cross-venue contagion.`;
  return `${symbol} momentum should be judged by trend acceptance, volume quality, and whether volatility expands in the direction of the break.`;
}

function fallbackInference(profile: VestigeAgentProfile, input: RunAgentRequest): string {
  const symbol = input.assetSymbol.toUpperCase();
  if (profile.slug.includes("macro")) return `Macro supports selective exposure only if liquidity remains constructive; otherwise ${symbol} should be faded into strength.`;
  if (profile.slug.includes("sentiment")) return `The trade improves if attention is rising but not euphoric; crowded consensus would lower expected value.`;
  if (profile.slug.includes("quant")) return `Risk/reward is acceptable only with tight invalidation and no chase after a one-standard-deviation move.`;
  if (profile.slug.includes("defi")) return `The cleanest invalidation is a liquidity stress signal, not a small price drawdown.`;
  return `Execution favors confirmation after a level reclaim or failed breakdown rather than passive exposure.`;
}

function fallbackEvidence(profile: VestigeAgentProfile, input: RunAgentRequest): string[] {
  const headlines = input.context?.headlines?.slice(0, 2) ?? [];
  return headlines.length > 0 ? headlines : [profile.specialty, "Live market context supplied to Vestige agent committee."];
}

function fallbackStance(profile: VestigeAgentProfile, input: RunAgentRequest): ReasoningTrace["positionIntent"]["side"] {
  const price = input.context?.price;
  if (!price) return profile.slug.includes("defi") ? "neutral" : "long";
  if (profile.slug.includes("defi")) return "neutral";
  return price > 0 ? "long" : "neutral";
}

function asSide(value: unknown): ReasoningTrace["positionIntent"]["side"] {
  return value === "short" || value === "neutral" ? value : "long";
}

function asConfidence(value: unknown): ReasoningTrace["confidence"] {
  return value === "low" || value === "high" ? value : "medium";
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}
