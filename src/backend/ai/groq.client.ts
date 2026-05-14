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

export interface GroqClient {
  generateJson(input: GroqGenerateJsonInput): Promise<unknown>;
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

    return parseJsonContent(content);
  }
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new VestigeError("Groq response was not valid JSON.", "GROQ_INVALID_JSON");
    }

    return JSON.parse(content.slice(start, end + 1));
  }
}
