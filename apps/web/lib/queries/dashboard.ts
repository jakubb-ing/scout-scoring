import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DashboardApi from "@/lib/api/dashboard";
import { qk } from "./keys";

export function useDashboard(raceId: string | null | undefined, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: qk.dashboard(raceId ?? "__nil__"),
    queryFn: () => DashboardApi.getDashboard(raceId as string),
    enabled: !!raceId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useLeaderboardGroups(raceId: string | null | undefined, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: qk.leaderboard(raceId ?? "__nil__"),
    queryFn: () => DashboardApi.getLeaderboardGroups(raceId as string),
    enabled: !!raceId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useResults(raceId: string | null | undefined) {
  return useQuery({
    queryKey: qk.results(raceId ?? "__nil__"),
    queryFn: () => DashboardApi.getResults(raceId as string),
    enabled: !!raceId,
  });
}

export function useAuditLog(
  raceId: string | null | undefined,
  query: DashboardApi.AuditQuery = {},
  enabled = true
) {
  return useQuery({
    queryKey: [...qk.audit(raceId ?? "__nil__"), query] as const,
    queryFn: () => DashboardApi.getAuditLog(raceId as string, query),
    enabled: !!raceId && enabled,
  });
}

function invalidateAfterCorrection(qc: ReturnType<typeof useQueryClient>, raceId: string) {
  qc.invalidateQueries({ queryKey: qk.dashboard(raceId) });
  qc.invalidateQueries({ queryKey: qk.results(raceId) });
  qc.invalidateQueries({ queryKey: qk.leaderboard(raceId) });
  qc.invalidateQueries({ queryKey: qk.audit(raceId) });
}

export function useCorrectScoreEntry(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DashboardApi.CorrectScorePayload) =>
      DashboardApi.correctScoreEntry(raceId, payload),
    onSuccess: () => invalidateAfterCorrection(qc, raceId),
  });
}

export function useDeleteScoreEntry(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, reason }: { entryId: string; reason: string }) =>
      DashboardApi.deleteScoreEntry(raceId, entryId, reason),
    onSuccess: () => invalidateAfterCorrection(qc, raceId),
  });
}
