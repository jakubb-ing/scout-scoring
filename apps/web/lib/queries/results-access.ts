import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, tokens } from "@/lib/api/client";
import { getResults } from "@/lib/api/dashboard";
import { getPublicResults } from "@/lib/api/public-results";
import type { ResultsPayload } from "@/lib/api/types";

export type ResultsAccessMode = "loading" | "needCode" | "ready" | "error";

export interface ResultsAccess {
  data: ResultsPayload | undefined;
  mode: ResultsAccessMode;
  raceName: string | null;
  codeError: string | null;
  submitting: boolean;
  submitCode: (code: string) => Promise<boolean>;
}

const codeKey = (raceId: string) => `ss.results_code.${raceId}`;

function readStoredCode(raceId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(codeKey(raceId));
}

function writeStoredCode(raceId: string, code: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(codeKey(raceId), code);
}

/**
 * Resolves results for either an authenticated organizer (no code needed) or
 * a public visitor who must supply the race's access code.
 *
 * Strategy: if an organizer token is present we try the authenticated endpoint
 * first. If that succeeds the visitor is the owner/a member — done. If it 401s
 * or 404s (expired token, or an organizer without access to this race) we fall
 * back to the code gate, same as an anonymous visitor.
 */
export function useResultsAccess(raceId: string | null | undefined): ResultsAccess {
  const queryClient = useQueryClient();
  const [ready, setReady] = React.useState(false);
  const [hasOrganizer, setHasOrganizer] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    setHasOrganizer(!!tokens.get("organizer"));
    setCode(raceId ? readStoredCode(raceId) : null);
    setReady(true);
  }, [raceId]);

  const organizerQuery = useQuery({
    queryKey: ["results-access", "organizer", raceId],
    queryFn: () => getResults(raceId as string),
    enabled: ready && hasOrganizer && !!raceId,
    retry: false,
  });

  const organizerDenied =
    organizerQuery.error instanceof ApiError &&
    (organizerQuery.error.status === 401 || organizerQuery.error.status === 404);

  // Public mode applies when there is no organizer session, or the organizer
  // has no access to this race.
  const publicMode = ready && (!hasOrganizer || organizerDenied);

  const publicQuery = useQuery({
    queryKey: ["results-access", "public", raceId, code],
    queryFn: () => getPublicResults(raceId as string, code as string),
    enabled: publicMode && !!raceId && !!code,
    retry: false,
  });

  const publicCodeRejected =
    publicQuery.error instanceof ApiError && publicQuery.error.status === 401;

  const submitCode = React.useCallback(
    async (value: string): Promise<boolean> => {
      if (!raceId) return false;
      const trimmed = value.trim();
      if (!trimmed) {
        setCodeError("Zadej kód.");
        return false;
      }

      setSubmitting(true);
      setCodeError(null);
      try {
        const payload = await getPublicResults(raceId, trimmed);
        writeStoredCode(raceId, trimmed);
        queryClient.setQueryData(["results-access", "public", raceId, trimmed], payload);
        setCode(trimmed);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setCodeError("Neplatný kód.");
        } else {
          setCodeError("Něco se pokazilo. Zkus to prosím znovu.");
        }
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [raceId, queryClient],
  );

  const data = organizerQuery.data ?? publicQuery.data;

  const mode: ResultsAccessMode = (() => {
    if (!ready || !raceId) return "loading";
    if (data) return "ready";
    if (hasOrganizer && !organizerDenied) {
      return organizerQuery.isError ? "error" : "loading";
    }
    // public mode
    if (!code || publicCodeRejected) return "needCode";
    if (publicQuery.isError) return "error";
    return "loading";
  })();

  return {
    data,
    mode,
    raceName: data?.race?.name ?? null,
    codeError,
    submitting,
    submitCode,
  };
}
