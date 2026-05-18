export interface IrysClient {
  uploadJson(payload: unknown, digest: string): Promise<string | undefined>;
}

export class HttpIrysClient implements IrysClient {
  constructor(
    private readonly endpoint = process.env.IRYS_UPLOAD_URL,
    private readonly apiKey = process.env.IRYS_API_KEY,
  ) {}

  async uploadJson(payload: unknown, digest: string): Promise<string | undefined> {
    if (!this.endpoint) return undefined;

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        tags: [
          { name: "Content-Type", value: "application/json" },
          { name: "App-Name", value: "Vestige" },
          { name: "Protocol", value: "vestige.trace" },
          { name: "Digest", value: digest },
        ],
        data: payload,
      }),
    });

    const body = await response.json().catch(() => ({})) as { id?: string; receipt?: { id?: string }; error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? `Irys upload failed (${response.status}).`);
    }

    return body.id ?? body.receipt?.id;
  }
}

export class NoopIrysClient implements IrysClient {
  async uploadJson(): Promise<string | undefined> {
    return undefined;
  }
}

export function createIrysClient(): IrysClient {
  return process.env.IRYS_UPLOAD_URL ? new HttpIrysClient() : new NoopIrysClient();
}
