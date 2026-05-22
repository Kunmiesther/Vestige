export type BridgeMode = "live" | "simulation";
export type BridgeTimelineState = "quoted" | "submitted" | "pending" | "attesting" | "completed" | "failed";

export interface BridgeHistoryEntry {
  id: string;
  mode: BridgeMode;
  sourceChainId: number;
  destinationChainId: number;
  amount: string;
  status: BridgeTimelineState;
  estimatedMinutes: string;
  createdAt: string;
  updatedAt: string;
  message?: string;
  transferId?: string;
  quoteId?: string;
}

const BRIDGE_HISTORY_PREFIX = "vestige_cctp_bridge_history";

export function loadBridgeHistory(address?: string | null): BridgeHistoryEntry[] {
  if (!address || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isBridgeHistoryEntry) : [];
  } catch {
    return [];
  }
}

export function saveBridgeHistory(address: string, entries: BridgeHistoryEntry[]): BridgeHistoryEntry[] {
  if (typeof window === "undefined") return entries;
  const normalized = entries.slice(0, 8);
  try {
    window.localStorage.setItem(key(address), JSON.stringify(normalized));
  } catch {}
  return normalized;
}

export function upsertBridgeHistory(address: string, entry: BridgeHistoryEntry): BridgeHistoryEntry[] {
  const items = loadBridgeHistory(address);
  const next = [entry, ...items.filter(item => item.id !== entry.id)];
  return saveBridgeHistory(address, next);
}

function key(address: string): string {
  return `${BRIDGE_HISTORY_PREFIX}:${address.toLowerCase()}`;
}

function isBridgeHistoryEntry(value: unknown): value is BridgeHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && (record.mode === "live" || record.mode === "simulation")
    && typeof record.sourceChainId === "number"
    && typeof record.destinationChainId === "number"
    && typeof record.amount === "string"
    && typeof record.status === "string"
    && typeof record.estimatedMinutes === "string"
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string";
}
