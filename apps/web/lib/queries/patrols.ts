import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as PatrolsApi from "@/lib/api/patrols";
import type { Patrol } from "@/lib/api/types";
import { qk } from "./keys";

export function usePatrols(raceId: string | null | undefined) {
  return useQuery({
    queryKey: qk.patrols(raceId ?? "__nil__"),
    queryFn: () => PatrolsApi.listPatrols(raceId as string),
    enabled: !!raceId,
    select: (data) => [...data].sort((a, b) => a.start_number - b.start_number),
  });
}

function invalidatePatrolScope(qc: ReturnType<typeof useQueryClient>, raceId: string) {
  qc.invalidateQueries({ queryKey: qk.patrols(raceId) });
  qc.invalidateQueries({ queryKey: qk.dashboard(raceId) });
  qc.invalidateQueries({ queryKey: qk.leaderboard(raceId) });
}

export function useCreatePatrol(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Patrol>) => PatrolsApi.createPatrol(raceId, data),
    onSuccess: () => invalidatePatrolScope(qc, raceId),
  });
}

export function useBulkCreatePatrols(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patrols: Partial<Patrol>[]) => PatrolsApi.bulkCreatePatrols(raceId, patrols),
    onSuccess: () => invalidatePatrolScope(qc, raceId),
  });
}

export function useUpdatePatrol(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Patrol> }) => PatrolsApi.updatePatrol(id, data),
    onSuccess: () => invalidatePatrolScope(qc, raceId),
  });
}

export function useDeletePatrol(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => PatrolsApi.deletePatrol(id),
    onSuccess: () => invalidatePatrolScope(qc, raceId),
  });
}

export function useWithdrawPatrol(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) =>
      PatrolsApi.withdrawPatrol(id, reason),
    onSuccess: () => invalidatePatrolScope(qc, raceId),
  });
}

export function useRestorePatrol(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => PatrolsApi.restorePatrol(id),
    onSuccess: () => invalidatePatrolScope(qc, raceId),
  });
}
