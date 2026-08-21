import { apiFetch } from "./client";

// Extrakce z dokumentu jde přes OpenAI a běžně trvá desítky sekund —
// výchozích 8 s z apiFetch by ji utnulo dřív, než dorazí odpověď.
// Vypršení tohohle timeoutu neznamená ztrátu sítě, takže se nepromítá
// do offline stavu aplikace.
const AI_EXTRACT_TIMEOUT_MS = 180_000;
const AI_REFINE_TIMEOUT_MS = 120_000;
import type {
  AiImportExtractResponse,
  AiImportRefineResponse,
  AiImportStationDraft,
} from "./types";

/**
 * Upload a document (PDF or text) and ask the AI to extract a draft list of
 * stations. The response also includes a `document_excerpt` we echo back into
 * `refineStations` so the BE doesn't need to keep state between calls.
 */
export async function extractStationsFromDocument(
  raceId: string,
  file: File,
): Promise<AiImportExtractResponse> {
  const form = new FormData();
  form.append("file", file);

  return apiFetch<AiImportExtractResponse>(`/api/races/${raceId}/ai-import/extract`, {
    method: "POST",
    scope: "organizer",
    body: form,
    timeoutMs: AI_EXTRACT_TIMEOUT_MS,
    reportOffline: false,
  });
}

export async function refineStations(
  raceId: string,
  args: {
    document_excerpt: string;
    draft_stations: AiImportStationDraft[];
    answers: { id: string; answer: string }[];
  },
): Promise<AiImportRefineResponse> {
  return apiFetch<AiImportRefineResponse>(`/api/races/${raceId}/ai-import/refine`, {
    method: "POST",
    scope: "organizer",
    body: args,
    timeoutMs: AI_REFINE_TIMEOUT_MS,
    reportOffline: false,
  });
}
