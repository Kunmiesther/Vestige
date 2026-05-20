import { VestigeError } from "../shared/errors";

export interface GroqChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqGenerateJsonInput {
  messages: GroqChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface GroqGenerateJsonResult {
  parsed: unknown;
  raw: string;
  repaired: boolean;
  repairSteps: string[];
}

export interface GroqClient {
  generateJson(input: GroqGenerateJsonInput): Promise<unknown>;
  generateJsonResult?(input: GroqGenerateJsonInput): Promise<GroqGenerateJsonResult>;
}

interface GroqChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class GroqHttpClient implements GroqClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(options?: { apiKey?: string; model?: string; endpoint?: string }) {
    const apiKey = options?.apiKey ?? process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new VestigeError("Missing GROQ_API_KEY.", "GROQ_API_KEY_MISSING");
    }

    this.apiKey = apiKey;
    this.model = options?.model ?? process.env.GROQ_MODEL ?? "deepseek-r1-distill-llama-70b";
    this.endpoint = options?.endpoint ?? "https://api.groq.com/openai/v1/chat/completions";
  }

  async generateJson(input: GroqGenerateJsonInput): Promise<unknown> {
    const result = await this.generateJsonResult(input);
    return result.parsed;
  }

  async generateJsonResult(input: GroqGenerateJsonInput): Promise<GroqGenerateJsonResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 1600,
        response_format: { type: "json_object" },
      }),
    });

    const payload = (await response.json()) as GroqChatCompletionResponse;

    if (!response.ok) {
      throw new VestigeError(
        payload.error?.message ?? "Groq request failed.",
        "GROQ_REQUEST_FAILED",
      );
    }

    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new VestigeError("Groq response did not include message content.", "GROQ_EMPTY_RESPONSE");
    }

    try {
      const result = parseJsonContent(content);
      if (result.repaired) {
        console.warn("[vestige:groq:json-repaired]", {
          repairSteps: result.repairSteps,
          rawModelResponse: content,
        });
      }
      return result;
    } catch (error) {
      console.error("[vestige:groq:invalid-json]", {
        rawModelResponse: content,
        error: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    }
  }
}

function parseJsonContent(content: string): GroqGenerateJsonResult {
  const raw = content;
  const candidates = buildJsonCandidates(content);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return {
        parsed: JSON.parse(candidate.value),
        raw,
        repaired: candidate.repairSteps.length > 0,
        repairSteps: candidate.repairSteps,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new VestigeError(
    `Groq response was not valid JSON after extraction and repair: ${lastError instanceof Error ? lastError.message : "unknown parse error"}`,
    "GROQ_INVALID_JSON",
  );
}

function buildJsonCandidates(content: string): Array<{ value: string; repairSteps: string[] }> {
  const candidates: Array<{ value: string; repairSteps: string[] }> = [];
  const seen = new Set<string>();

  function add(value: string, repairSteps: string[]) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push({ value: trimmed, repairSteps });

    const withoutTrailingCommas = removeTrailingCommas(trimmed);
    if (withoutTrailingCommas !== trimmed && !seen.has(withoutTrailingCommas)) {
      seen.add(withoutTrailingCommas);
      candidates.push({
        value: withoutTrailingCommas,
        repairSteps: [...repairSteps, "removed trailing commas"],
      });
    }
  }

  const trimmed = content.trim().replace(/^\uFEFF/, "");
  add(trimmed, []);

  const withoutThinking = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (withoutThinking !== trimmed) {
    add(withoutThinking, ["removed model thinking wrapper"]);
  }

  const withoutMarkdown = stripMarkdownFence(withoutThinking);
  if (withoutMarkdown !== withoutThinking) {
    add(withoutMarkdown, ["removed markdown code fence"]);
  }

  const extracted = extractFirstBalancedJson(withoutMarkdown) ?? extractFirstBalancedJson(trimmed);
  if (extracted) {
    add(extracted, ["extracted first balanced JSON object"]);
  }

  return candidates;
}

function stripMarkdownFence(value: string): string {
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function removeTrailingCommas(value: string): string {
  return value.replace(/,\s*([}\]])/g, "$1");
}

function extractFirstBalancedJson(value: string): string | null {
  for (let start = 0; start < value.length; start += 1) {
    const opening = value[start];
    if (opening !== "{" && opening !== "[") continue;

    const closing = opening === "{" ? "}" : "]";
    const stack: string[] = [closing];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < value.length; index += 1) {
      const char = value[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{") stack.push("}");
      if (char === "[") stack.push("]");
      if (char === "}" || char === "]") {
        if (stack.pop() !== char) break;
        if (stack.length === 0) return value.slice(start, index + 1);
      }
    }
  }

  return null;
}
