import Dexie, { type EntityTable } from "dexie";

export type OutboxStatus = "pending" | "blocked" | "blocked_auth";

export interface OutboxItem {
  id: number;
  kind: string;
  /** Unique — druhý zápis stejného cíle přepíše ten čekající. */
  dedupeKey: string;
  /**
   * Položky se stejným chainKey se odesílají v pořadí vložení a selhání
   * jedné blokuje další v řetězci (např. feedback draft → submit).
   */
  chainKey: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  status: OutboxStatus;
}

export const offlineDb = new Dexie("scout-scoring-offline") as Dexie & {
  outbox: EntityTable<OutboxItem, "id">;
};

offlineDb.version(1).stores({
  outbox: "++id, kind, &dedupeKey, chainKey, status, createdAt",
});
