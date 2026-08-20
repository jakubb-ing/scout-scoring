import { apiFetch } from "./client";
import type { Patrol } from "./types";

interface ListResponse<T> { data: T[] }

export async function listPatrols(raceId: string): Promise<Patrol[]> {
  const res = await apiFetch<ListResponse<Patrol>>(`/api/races/${raceId}/patrols`, {
    scope: "organizer",
  });
  return res.data ?? [];
}

export async function createPatrol(raceId: string, data: Partial<Patrol>): Promise<Patrol> {
  return apiFetch<Patrol>(`/api/races/${raceId}/patrols`, {
    method: "POST",
    scope: "organizer",
    body: data,
  });
}

export async function bulkCreatePatrols(raceId: string, patrols: Partial<Patrol>[]) {
  return apiFetch<{ created?: number } & Record<string, unknown>>(
    `/api/races/${raceId}/patrols/bulk`,
    { method: "POST", scope: "organizer", body: { patrols } }
  );
}

export async function updatePatrol(id: string, data: Partial<Patrol>): Promise<Patrol> {
  return apiFetch<Patrol>(`/api/patrols/${id}`, {
    method: "PUT",
    scope: "organizer",
    body: data,
  });
}

export async function deletePatrol(id: string): Promise<void> {
  await apiFetch<void>(`/api/patrols/${id}`, { method: "DELETE", scope: "organizer" });
}

export async function withdrawPatrol(id: string, reason: string | null): Promise<Patrol> {
  return apiFetch<Patrol>(`/api/patrols/${id}/withdraw`, {
    method: "POST",
    scope: "organizer",
    body: { reason },
  });
}

export async function restorePatrol(id: string): Promise<Patrol> {
  return apiFetch<Patrol>(`/api/patrols/${id}/restore`, { method: "POST", scope: "organizer" });
}
