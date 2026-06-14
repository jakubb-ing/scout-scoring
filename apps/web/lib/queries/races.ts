import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as RacesApi from "@/lib/api/races";
import type { Race } from "@/lib/api/types";
import { qk } from "./keys";

export function useRaces() {
  return useQuery({ queryKey: qk.races.all, queryFn: RacesApi.listRaces });
}

export function useRace(id: string | null | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.races.detail(id ?? "__nil__"),
    queryFn: () => RacesApi.getRace(id as string),
    enabled: !!id,
    // Seed detail from the list cache so tabs render instantly while the
    // detail fetch is in-flight.
    initialData: () => {
      if (!id) return undefined;
      const list = qc.getQueryData<Race[]>(qk.races.all);
      return list?.find((r) => r.id === id);
    },
  });
}

export function useCreateRace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Race>) => RacesApi.createRace(data),
    onSuccess: (race) => {
      qc.invalidateQueries({ queryKey: qk.races.all });
      qc.setQueryData(qk.races.detail(race.id), race);
    },
  });
}

export function useUpdateRace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Race>) => RacesApi.updateRace(id, data),
    onSuccess: (race) => {
      qc.setQueryData(qk.races.detail(id), race);
      qc.invalidateQueries({ queryKey: qk.races.all });
    },
  });
}

export function useActivateRace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => RacesApi.activateRace(id),
    onSuccess: ({ race }) => {
      qc.setQueryData(qk.races.detail(id), race);
      qc.invalidateQueries({ queryKey: qk.races.all });
      qc.invalidateQueries({ queryKey: qk.stations(id) });
      qc.invalidateQueries({ queryKey: qk.dashboard(id) });
    },
  });
}

export function useCloseRace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => RacesApi.closeRace(id),
    onSuccess: (race) => {
      qc.setQueryData(qk.races.detail(id), race);
      qc.invalidateQueries({ queryKey: qk.races.all });
      qc.invalidateQueries({ queryKey: qk.stations(id) });
      qc.invalidateQueries({ queryKey: qk.dashboard(id) });
    },
  });
}

export function useRegeneratePublicCode(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => RacesApi.regeneratePublicCode(id),
    onSuccess: (race) => {
      qc.setQueryData(qk.races.detail(id), race);
      qc.invalidateQueries({ queryKey: qk.races.all });
    },
  });
}

export function useReissueStationTokens(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => RacesApi.reissueStationTokens(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.stations(id) });
    },
  });
}

export function useRaceMembers(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.raceMembers(id),
    queryFn: () => RacesApi.listRaceMembers(id),
    enabled,
  });
}

export function useShareRace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { organizer_id: string; role: "read" | "edit" }) =>
      RacesApi.shareRace(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.raceMembers(id) });
    },
  });
}

export function useUpdateRaceMember(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: "read" | "edit" }) =>
      RacesApi.updateRaceMember(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.raceMembers(raceId) });
    },
  });
}

export function useDeleteRaceMember(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: RacesApi.deleteRaceMember,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.raceMembers(raceId) });
    },
  });
}
