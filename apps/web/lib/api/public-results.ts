import { apiFetch } from "./client";
import type { ResultsPayload } from "./types";

/**
 * Public, code-gated results for a race. No auth scope — the access code is
 * passed as a query param and validated server-side against race.public_code.
 * A wrong/missing code yields ApiError 401.
 */
export async function getPublicResults(raceId: string, code: string): Promise<ResultsPayload> {
  return apiFetch<ResultsPayload>(
    `/api/public/races/${raceId}/results?code=${encodeURIComponent(code)}`,
  );
}
