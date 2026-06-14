import { apiFetch } from "./client";
import type { ActivationPayload, Race, RaceMember, Station } from "./types";

export interface ReissueTokensPayload {
  race_id: string;
  stations: (Station & { access_token?: string })[];
}

interface ListResponse<T> { data: T[] }

type ApiRace = Race & { held_on?: string | null };

function mapRaceFromApi(race: ApiRace): Race {
  return {
    ...race,
    date: race.date ?? race.held_on ?? null,
  };
}

function mapRaceToApi(data: Partial<Race>): Record<string, unknown> {
  const { date, ...rest } = data;

  return {
    ...rest,
    held_on: date,
  };
}

export async function listRaces(): Promise<Race[]> {
  const res = await apiFetch<ListResponse<ApiRace>>("/api/races", { scope: "organizer" });
  return (res.data ?? []).map(mapRaceFromApi);
}

export async function getRace(id: string): Promise<Race> {
  const race = await apiFetch<ApiRace>(`/api/races/${id}`, { scope: "organizer" });
  return mapRaceFromApi(race);
}

export async function createRace(data: Partial<Race>): Promise<Race> {
  const race = await apiFetch<ApiRace>("/api/races", {
    method: "POST",
    scope: "organizer",
    body: mapRaceToApi(data),
  });
  return mapRaceFromApi(race);
}

export async function updateRace(id: string, data: Partial<Race>): Promise<Race> {
  const race = await apiFetch<ApiRace>(`/api/races/${id}`, {
    method: "PUT",
    scope: "organizer",
    body: mapRaceToApi(data),
  });
  return mapRaceFromApi(race);
}

export async function activateRace(id: string): Promise<ActivationPayload> {
  const payload = await apiFetch<ActivationPayload & { race: ApiRace }>(`/api/races/${id}/activate`, {
    method: "POST",
    scope: "organizer",
  });
  return {
    ...payload,
    race: mapRaceFromApi(payload.race),
  };
}

export async function closeRace(id: string): Promise<Race> {
  const race = await apiFetch<ApiRace>(`/api/races/${id}/close`, { method: "POST", scope: "organizer" });
  return mapRaceFromApi(race);
}

export async function regeneratePublicCode(id: string): Promise<Race> {
  const race = await apiFetch<ApiRace>(`/api/races/${id}/regenerate_public_code`, {
    method: "POST",
    scope: "organizer",
  });
  return mapRaceFromApi(race);
}

export async function reissueStationTokens(id: string): Promise<ReissueTokensPayload> {
  return apiFetch<ReissueTokensPayload>(`/api/races/${id}/reissue_tokens`, {
    method: "POST",
    scope: "organizer",
  });
}

export async function listRaceMembers(raceId: string): Promise<RaceMember[]> {
  const res = await apiFetch<ListResponse<RaceMember>>(`/api/races/${raceId}/members`, {
    scope: "organizer",
  });
  return res.data ?? [];
}

export async function shareRace(
  raceId: string,
  data: { organizer_id: string; role: RaceMember["role"] }
): Promise<RaceMember> {
  return apiFetch<RaceMember>(`/api/races/${raceId}/members`, {
    method: "POST",
    scope: "organizer",
    body: data,
  });
}

export async function updateRaceMember(id: string, role: RaceMember["role"]): Promise<RaceMember> {
  return apiFetch<RaceMember>(`/api/race-members/${id}`, {
    method: "PUT",
    scope: "organizer",
    body: { role },
  });
}

export async function deleteRaceMember(id: string): Promise<void> {
  await apiFetch<void>(`/api/race-members/${id}`, { method: "DELETE", scope: "organizer" });
}
