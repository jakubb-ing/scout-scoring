"use client";

/**
 * Registrace offline mutací. Import tohoto modulu (z Providers) je
 * side-effect, který naplní registr outboxu. Nová offline mutace =
 * nový `registerOutboxKind` blok tady.
 */

import * as StationApi from "@/lib/api/station";
import type { PendingScoreEntry, ScoreEntry } from "@/lib/api/types";
import { qk } from "@/lib/queries/keys";
import { registerOutboxKind } from "./outbox";

export interface StationScorePayload extends StationApi.UpsertScorePayload {
  /** Pro dedupe/chain klíč a cílení cache — server bere stanoviště z tokenu. */
  stationId: string;
}

export function stationChainKey(stationId: string) {
  return `station:${stationId}`;
}

export function pendingEntryFromPayload(payload: StationScorePayload): PendingScoreEntry {
  return {
    id: `local:${payload.stationId}:${payload.patrol_id}`,
    station: payload.stationId,
    patrol: payload.patrol_id,
    scores: payload.scores,
    arrived_at: payload.arrived_at ?? null,
    departed_at: payload.departed_at ?? null,
    _pending: true,
  };
}

function mergeEntry(entries: ScoreEntry[] | undefined, entry: ScoreEntry): ScoreEntry[] {
  const rest = (entries ?? []).filter((e) => e.patrol !== entry.patrol);
  return [...rest, entry];
}

registerOutboxKind<StationScorePayload, ScoreEntry>("station.score", {
  send: ({ stationId: _stationId, ...payload }) => StationApi.upsertScoreEntry(payload),
  dedupeKey: (p) => `${p.stationId}:${p.patrol_id}`,
  chainKey: (p) => `${stationChainKey(p.stationId)}:${p.patrol_id}`,
  onApplied: (qc, p) => {
    qc.setQueryData<ScoreEntry[]>(qk.stationEntries(p.stationId), (prev) =>
      mergeEntry(prev, pendingEntryFromPayload(p))
    );
  },
  onFlushed: (qc, p, entry) => {
    qc.setQueryData<ScoreEntry[]>(qk.stationEntries(p.stationId), (prev) =>
      mergeEntry(prev, entry)
    );
  },
});
