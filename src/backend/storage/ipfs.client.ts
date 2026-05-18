export interface IpfsClient {
  addJson(payload: unknown, digest: string): Promise<string | undefined>;
}

export class PinataIpfsClient implements IpfsClient {
  constructor(
    private readonly jwt = process.env.PINATA_JWT,
    private readonly endpoint = process.env.PINATA_API_URL ?? "https://api.pinata.cloud/pinning/pinJSONToIPFS",
  ) {}

  async addJson(payload: unknown, digest: string): Promise<string | undefined> {
    if (!this.jwt) return undefined;

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataMetadata: {
          name: `vestige-trace-${digest.slice(0, 16)}`,
          keyvalues: { protocol: "vestige.trace", digest },
        },
        pinataContent: payload,
      }),
    });

    const body = await response.json().catch(() => ({})) as { IpfsHash?: string; error?: { details?: string } };
    if (!response.ok) {
      throw new Error(body.error?.details ?? `IPFS pin failed (${response.status}).`);
    }

    return body.IpfsHash;
  }
}

export class NoopIpfsClient implements IpfsClient {
  async addJson(): Promise<string | undefined> {
    return undefined;
  }
}

export function createIpfsClient(): IpfsClient {
  return process.env.PINATA_JWT ? new PinataIpfsClient() : new NoopIpfsClient();
}
