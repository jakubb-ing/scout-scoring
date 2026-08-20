/**
 * Endpoints for the patrol's accompanying adult (slovní zpětná vazba).
 * All authenticated calls use the feedback token (patrol-scoped, 72 h).
 */
import { apiFetch } from "./client";

export interface FeedbackRecord {
  id: string;
  positives: string[];
  negatives: string[];
  state: "draft" | "submitted";
  submitted_at?: string | null;
  reopened_at?: string | null;
  reopen_count: number;
  lock_device?: string | null;
  lock_at?: string | null;
}

export interface FeedbackPatrol {
  id: string;
  name: string;
  start_number: number;
}

export interface FeedbackRace {
  id: string;
  name?: string | null;
  state: string;
  closed_at?: string | null;
}

export interface FeedbackConfig {
  positive_count: number;
  negative_count: number;
}

export interface FeedbackLoginResponse {
  token: string;
  patrol: FeedbackPatrol;
  race: FeedbackRace;
  config: FeedbackConfig;
}

export interface FeedbackMePayload {
  patrol: FeedbackPatrol;
  race: FeedbackRace;
  config: FeedbackConfig;
  feedback: FeedbackRecord | null;
  window_open: boolean;
}

export async function loginFeedback(patrolId: string, pin: string): Promise<FeedbackLoginResponse> {
  return apiFetch<FeedbackLoginResponse>("/api/feedback/login", {
    method: "POST",
    body: { patrol_id: patrolId, pin },
  });
}

export async function getFeedbackMe(tokenOverride?: string): Promise<FeedbackMePayload> {
  return apiFetch<FeedbackMePayload>("/api/feedback/me", {
    scope: "feedback",
    tokenOverride,
  });
}

export interface FeedbackDraftPayload {
  positives: string[];
  negatives: string[];
  device_id: string;
}

export async function saveFeedbackDraft(payload: FeedbackDraftPayload): Promise<{ feedback: FeedbackRecord }> {
  return apiFetch<{ feedback: FeedbackRecord }>("/api/feedback/draft", {
    method: "PUT",
    scope: "feedback",
    body: payload,
  });
}

export async function takeoverFeedback(deviceId: string): Promise<{ feedback: FeedbackRecord }> {
  return apiFetch<{ feedback: FeedbackRecord }>("/api/feedback/takeover", {
    method: "POST",
    scope: "feedback",
    body: { device_id: deviceId },
  });
}

export async function submitFeedback(deviceId: string): Promise<{ feedback: FeedbackRecord }> {
  return apiFetch<{ feedback: FeedbackRecord }>("/api/feedback/submit", {
    method: "POST",
    scope: "feedback",
    body: { device_id: deviceId },
  });
}

// ---------- organizer ----------

export interface RaceFeedbackRow {
  id: string;
  patrol: string;
  state: "draft" | "submitted";
  submitted_at?: string | null;
  reopen_count: number;
  updated_at?: string;
  locked?: boolean;
}

export async function listRaceFeedback(raceId: string): Promise<RaceFeedbackRow[]> {
  const res = await apiFetch<{ data: RaceFeedbackRow[] }>(`/api/races/${raceId}/feedback`, {
    scope: "organizer",
  });
  return res.data ?? [];
}

export async function reopenFeedback(feedbackId: string, reason: string): Promise<void> {
  await apiFetch(`/api/patrol-feedback/${feedbackId}/reopen`, {
    method: "POST",
    scope: "organizer",
    body: { reason },
  });
}

export async function resetPatrolFeedbackPin(patrolId: string) {
  return apiFetch<{ id: string; feedback_pin?: string }>(`/api/patrols/${patrolId}/feedback_pin`, {
    method: "POST",
    scope: "organizer",
  });
}
