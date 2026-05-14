import type { ISODateTime, UUID } from "./common";

export interface Builder {
  id: UUID;
  userId: UUID;
  displayName: string;
  walletAddress?: string;
  attributionSlug: string;
  createdAt: ISODateTime;
}
