"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb, type OutboxItem } from "./db";
import { enqueue } from "./outbox";
import { useIsOffline } from "./online";

/**
 * Náhrada za useMutation pro offline mutace: zapíše do outboxu, udělá
 * optimistický update cache (onApplied v registru) a hned resolvne —
 * pro uživatele není rozdíl mezi „uloženo" a „uloženo lokálně".
 */
export function useOfflineMutation<TPayload>(kind: string) {
  const mutateAsync = useCallback((payload: TPayload) => enqueue(kind, payload), [kind]);
  return { mutateAsync };
}

export interface OutboxStatusSnapshot {
  isOffline: boolean;
  pendingCount: number;
  blockedCount: number;
  authBlockedCount: number;
  items: OutboxItem[];
}

/** Stav fronty pro UI indikátory, volitelně jen pro jeden chainKey prefix. */
export function useOutboxStatus(chainKeyPrefix?: string): OutboxStatusSnapshot {
  const isOffline = useIsOffline();
  const items =
    useLiveQuery(async () => {
      const all = await offlineDb.outbox.orderBy("id").toArray();
      return chainKeyPrefix ? all.filter((i) => i.chainKey.startsWith(chainKeyPrefix)) : all;
    }, [chainKeyPrefix]) ?? [];

  return {
    isOffline,
    pendingCount: items.filter((i) => i.status === "pending").length,
    blockedCount: items.filter((i) => i.status === "blocked").length,
    authBlockedCount: items.filter((i) => i.status === "blocked_auth").length,
    items,
  };
}
