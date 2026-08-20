import { useQuery, useMutation } from "@tanstack/react-query";
import * as StationApi from "@/lib/api/station";
import { useOfflineMutation } from "@/lib/offline/hooks";
import type { StationScorePayload } from "@/lib/offline/register";
import { qk } from "./keys";

// Station data jdou do persistované offline cache (allowlist
// v lib/offline/persisted-queries.ts) — offlineFirst + delší staleTime,
// aby se z louky zbytečně nefetchovalo.
const offlineQueryOptions = {
  networkMode: "offlineFirst" as const,
  staleTime: 60_000,
  gcTime: 72 * 60 * 60 * 1000,
};

export function useStationMe(stationId: string, tokenOverride?: string, enabled = true) {
  return useQuery({
    queryKey: [...qk.stationMe(stationId), tokenOverride ?? "__stored__"] as const,
    queryFn: () => StationApi.getStationMe(tokenOverride),
    enabled,
    ...offlineQueryOptions,
  });
}

export function useStationLogin() {
  return useMutation({
    mutationFn: ({ stationId, pin }: { stationId: string; pin: string }) =>
      StationApi.loginStation(stationId, pin),
  });
}

export function useActiveStationRaces() {
  return useQuery({
    queryKey: qk.stationRaces,
    queryFn: StationApi.listActiveRaces,
  });
}

export function useActiveStations(raceId: string | null | undefined) {
  return useQuery({
    queryKey: qk.stationOptions(raceId ?? "__nil__"),
    queryFn: () => StationApi.listActiveStations(raceId as string),
    enabled: !!raceId,
  });
}

export function useStationEntries(stationId: string, enabled = true) {
  return useQuery({
    queryKey: qk.stationEntries(stationId),
    queryFn: StationApi.listStationEntries,
    enabled,
    ...offlineQueryOptions,
  });
}

export function useUpsertScoreEntry() {
  return useOfflineMutation<StationScorePayload>("station.score");
}
