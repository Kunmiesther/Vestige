import { createHash } from "node:crypto";
import type { PublishedTracePayload } from "../shared/types/trace";
import { createIpfsClient, type IpfsClient } from "./ipfs.client";
import { createIrysClient, type IrysClient } from "./irys.client";

export interface StoredTraceArtifact {
  digest: string;
  ipfsCid?: string;
  irysId?: string;
  payload: PublishedTracePayload;
}

export interface StorageService {
  publishTracePayload(payload: PublishedTracePayload): Promise<StoredTraceArtifact>;
}

export class DefaultStorageService implements StorageService {
  constructor(
    private readonly ipfsClient: IpfsClient = createIpfsClient(),
    private readonly irysClient: IrysClient = createIrysClient(),
  ) {}

  async publishTracePayload(payload: PublishedTracePayload): Promise<StoredTraceArtifact> {
    const canonicalPayload = stableStringify(payload);
    const digest = createHash("sha256").update(canonicalPayload).digest("hex");
    const [ipfsCid, irysId] = await Promise.all([
      this.ipfsClient.addJson(payload, digest).catch(() => undefined),
      this.irysClient.uploadJson(payload, digest).catch(() => undefined),
    ]);

    return {
      digest,
      ipfsCid,
      irysId,
      payload,
    };
  }
}

export function createStorageService(): StorageService {
  return new DefaultStorageService();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortObject((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}
