import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GroqHttpClient, type GroqClient } from "../ai/groq.client";
import { createPositionService, type PositionService } from "../positions/position.service";
import { reasoningTraceSchema } from "../shared/schemas/trace.zod";
import { VestigeError } from "../shared/errors";
import type { RunAgentRequest, RunAgentResponse } from "../shared/types/api";
import type { Agent } from "../shared/types/agent";
import type { ReasoningStep, ReasoningTrace } from "../shared/types/trace";
import { createTraceRepository, type TraceRepository } from "../traces/trace.repository";
import { createTraceService, type TraceService } from "../traces/trace.service";

export const runAgentRequestSchema = z.object({
  market: z.string().min(1),
  assetSymbol: z.string().min(1),
  context: z
    .object({
      price: z.number().optional(),
      headlines: z.array(z.string()).optional(),
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
}

const generatedTraceBodySchema = reasoningTraceSchema
  .pick({
    thesis: true,
    reasoningSteps: true,
    risks: true,
    catalysts: true,
    confidence: true,
    positionIntent: true,
  })
  .strict();

export class DefaultAgentRunner implements AgentRunner {
  constructor(
    private readonly repository: TraceRepository = createTraceRepository(),
    private readonly groqClient: GroqClient = new GroqHttpClient(),
    private readonly traceService: TraceService = createTraceService(repository),
    private readonly positionService: PositionService = createPositionService(repository),
  ) {}

  async run(agentId: string, request: RunAgentRequest): Promise<RunAgentResponse> {
    const input = runAgentRequestSchema.parse(request);
    const agent = await this.repository.findAgent(agentId);

    if (agent.status !== "active") {
      throw new VestigeError("Agent is not active.", "AGENT_NOT_ACTIVE");
    }

    const generatedPayload = await this.generateTraceBody(agent, input);
    const now = new Date().toISOString();

    const candidateTrace: ReasoningTrace = {
      id: randomUUID(),
      agentId: agent.id,
      builderId: agent.builderId,
      market: input.market,
      assetSymbol: input.assetSymbol,
      thesis: generatedPayload.thesis,
      reasoningSteps: generatedPayload.reasoningSteps,
      risks: generatedPayload.risks,
      catalysts: generatedPayload.catalysts,
      confidence: generatedPayload.confidence,
      positionIntent: generatedPayload.positionIntent,
      rawModelOutput: JSON.stringify(generatedPayload),
      status: "stored",
      createdAt: now,
    };

    const validatedTrace = reasoningTraceSchema.parse(candidateTrace);
    const trace = await this.traceService.storeTrace(validatedTrace);
    const position = await this.positionService.createFromTrace(trace);

    await this.stubPublishTrace(trace);

    return { trace, position };
  }

  private async generateTraceBody(
    agent: Agent,
    input: RunAgentRequest,
  ): Promise<GeneratedTraceBody> {
    const generated = await this.groqClient.generateJson({
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(agent),
        },
        {
          role: "user",
          content: buildUserPrompt(input),
        },
      ],
    });

    const parsed = generatedTraceBodySchema.safeParse(generated);

    if (!parsed.success) {
      throw new VestigeError(
        `Groq output failed trace validation: ${parsed.error.message}`,
        "TRACE_VALIDATION_FAILED",
      );
    }

    return parsed.data;
  }

  private async stubPublishTrace(_trace: ReasoningTrace): Promise<void> {
    return Promise.resolve();
  }
}

export function createAgentRunner(): AgentRunner {
  return new DefaultAgentRunner();
}

function buildSystemPrompt(agent: Agent): string {
  return [
    agent.systemPrompt,
    "Return only valid JSON.",
    "Do not include markdown, commentary, XML, or chain-of-thought.",
    "The JSON object must exactly match this shape:",
    JSON.stringify({
      thesis: "string",
      reasoningSteps: [
        {
          order: 0,
          title: "string",
          observation: "string",
          inference: "string",
          evidence: ["string"],
        },
      ],
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
    }),
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
