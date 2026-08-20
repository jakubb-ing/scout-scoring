/**
 * Thin fetch wrapper for the Elixir API.
 *
 * Two separate token scopes live in localStorage:
 *   - `organizer_token` — long-ish JWT from POST /api/auth/login
 *   - `station_token`   — short-lived, race-scoped JWT from POST /api/station/login
 *
 * Call `apiFetch(path, { scope: "organizer" | "station" })` and the right
 * Authorization header is attached. 401s bubble as `ApiError` so UI layers
 * can redirect to login / re-scan.
 */

import { reportNetworkFailure, reportNetworkSuccess } from "@/lib/offline/online";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

// Na louce je reálný scénář flaky síť, ne tvrdý offline — bez timeoutu
// appka na slabém signálu visí desítky sekund místo pádu do offline větve.
const REQUEST_TIMEOUT_MS = 8_000;

export type TokenScope = "organizer" | "station";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  scope?: TokenScope;
  body?: unknown;
  tokenOverride?: string;
}

const STORAGE_KEYS: Record<TokenScope, string> = {
  organizer: "ss.organizer_token",
  station: "ss.station_token",
};

export const tokens = {
  get(scope: TokenScope): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEYS[scope]);
  },
  set(scope: TokenScope, token: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS[scope], token);
  },
  clear(scope: TokenScope) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEYS[scope]);
  },
};

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { scope, body, headers, tokenOverride, ...rest } = options;
  const url = `${API_URL}${path}`;

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const h: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  // FormData: let the browser set Content-Type with the multipart boundary.
  if (body !== undefined && !isFormData) h["Content-Type"] = "application/json";

  const token = tokenOverride ?? (scope ? tokens.get(scope) : null);
  if (token) h.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: h,
      signal: rest.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body:
        body === undefined
          ? undefined
          : isFormData
          ? (body as FormData)
          : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    reportNetworkFailure();
    throw err;
  }
  reportNetworkSuccess();

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed: unknown = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, parsed, `API ${res.status} on ${path}`);
  }

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
