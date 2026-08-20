"use client";

/**
 * Registrace offline mutací. Import tohoto modulu (z Providers) je
 * side-effect, který naplní registr outboxu. Nová offline mutace =
 * nový `registerOutboxKind` blok tady.
 */

import { ApiError } from "@/lib/api/client";
import * as FeedbackApi from "@/lib/api/feedback";
import type { FeedbackMePayload } from "@/lib/api/feedback";
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

export function feedbackChainKey(patrolId: string) {
  return `feedback:${patrolId}`;
}

export interface FeedbackDraftOutboxPayload extends FeedbackApi.FeedbackDraftPayload {
  patrolId: string;
}

export interface FeedbackSubmitOutboxPayload {
  patrolId: string;
  device_id: string;
}

// Konfliktní 409 (lock drží jiné zařízení) se nesmí tiše zahodit jako
// ostatní 4xx — položka zůstane blocked a UI nabídne převzetí. Blokuje
// i submit téže hlídky (společný chainKey).
function classifyFeedbackError(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return "blocked" as const;
  return null;
}

function patchFeedbackCache(
  qc: import("@tanstack/react-query").QueryClient,
  patrolId: string,
  patch: Partial<FeedbackApi.FeedbackRecord>
) {
  qc.setQueriesData<FeedbackMePayload>({ queryKey: qk.feedbackMe(patrolId) }, (prev) => {
    if (!prev) return prev;
    const base: FeedbackApi.FeedbackRecord = prev.feedback ?? {
      id: `local:${patrolId}`,
      positives: [],
      negatives: [],
      state: "draft",
      reopen_count: 0,
    };
    return { ...prev, feedback: { ...base, ...patch } };
  });
}

registerOutboxKind<FeedbackDraftOutboxPayload, { feedback: FeedbackApi.FeedbackRecord }>(
  "feedback.draft",
  {
    send: ({ patrolId: _patrolId, ...payload }) => FeedbackApi.saveFeedbackDraft(payload),
    dedupeKey: (p) => `feedback:${p.patrolId}`,
    chainKey: (p) => feedbackChainKey(p.patrolId),
    classifyError: classifyFeedbackError,
    onApplied: (qc, p) => {
      patchFeedbackCache(qc, p.patrolId, { positives: p.positives, negatives: p.negatives });
    },
    onFlushed: (qc, p, result) => {
      patchFeedbackCache(qc, p.patrolId, result.feedback);
    },
  }
);

registerOutboxKind<FeedbackSubmitOutboxPayload, { feedback: FeedbackApi.FeedbackRecord }>(
  "feedback.submit",
  {
    send: (p) => FeedbackApi.submitFeedback(p.device_id),
    dedupeKey: (p) => `feedback-submit:${p.patrolId}`,
    chainKey: (p) => feedbackChainKey(p.patrolId),
    classifyError: classifyFeedbackError,
    onApplied: (qc, p) => {
      patchFeedbackCache(qc, p.patrolId, { state: "submitted" });
    },
    onFlushed: (qc, p, result) => {
      patchFeedbackCache(qc, p.patrolId, result.feedback);
    },
  }
);

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
