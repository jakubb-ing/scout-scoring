import { apiFetch } from "./client";
import type {
  AuditLogEntry,
  DashboardPayload,
  LeaderboardGroup,
  LeaderboardRow,
  ResultsPayload,
  ScoreEntry,
} from "./types";

interface ListResponse<T> { data: T[] }

export async function getDashboard(raceId: string): Promise<DashboardPayload> {
  return apiFetch<DashboardPayload>(`/api/races/${raceId}/dashboard`, {
    scope: "organizer",
  });
}

export async function getLeaderboard(raceId: string): Promise<LeaderboardRow[]> {
  const res = await apiFetch<ListResponse<LeaderboardGroup>>(`/api/races/${raceId}/leaderboard`, {
    scope: "organizer",
  });
  return (res.data ?? []).flatMap((group) =>
    group.rows.map((row) => ({
      ...row,
      category_name: group.category_name,
      scored: group.scored,
    })),
  );
}

export async function getLeaderboardGroups(raceId: string): Promise<LeaderboardGroup[]> {
  const res = await apiFetch<ListResponse<LeaderboardGroup>>(`/api/races/${raceId}/leaderboard`, {
    scope: "organizer",
  });
  return res.data ?? [];
}

export async function getResults(raceId: string): Promise<ResultsPayload> {
  return apiFetch<ResultsPayload>(`/api/races/${raceId}/results`, {
    scope: "organizer",
  });
}

export interface AuditQuery {
  action?: string;
  limit?: number;
  offset?: number;
}

export async function getAuditLog(raceId: string, query: AuditQuery = {}): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (query.action) params.set("action", query.action);
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.offset != null) params.set("offset", String(query.offset));
  const qs = params.toString();

  const res = await apiFetch<ListResponse<AuditLogEntry>>(
    `/api/races/${raceId}/audit${qs ? `?${qs}` : ""}`,
    { scope: "organizer" }
  );
  return res.data ?? [];
}

export interface CorrectScorePayload {
  station_id: string;
  patrol_id: string;
  scores: { criterion: string; points: number }[];
  reason: string;
}

export async function correctScoreEntry(
  raceId: string,
  payload: CorrectScorePayload
): Promise<ScoreEntry> {
  return apiFetch<ScoreEntry>(`/api/races/${raceId}/scores/correct`, {
    method: "POST",
    scope: "organizer",
    body: payload,
  });
}

export async function deleteScoreEntry(
  raceId: string,
  entryId: string,
  reason: string
): Promise<void> {
  await apiFetch<void>(`/api/races/${raceId}/scores/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
    scope: "organizer",
    body: { reason },
  });
}
