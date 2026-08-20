import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as FeedbackApi from "@/lib/api/feedback";
import { qk } from "./keys";

const offlineQueryOptions = {
  networkMode: "offlineFirst" as const,
  staleTime: 60_000,
  gcTime: 72 * 60 * 60 * 1000,
};

export function useFeedbackMe(patrolId: string, tokenOverride?: string, enabled = true) {
  return useQuery({
    queryKey: [...qk.feedbackMe(patrolId), tokenOverride ?? "__stored__"] as const,
    queryFn: () => FeedbackApi.getFeedbackMe(tokenOverride),
    enabled,
    ...offlineQueryOptions,
  });
}

export function useFeedbackLogin() {
  return useMutation({
    mutationFn: ({ patrolId, pin }: { patrolId: string; pin: string }) =>
      FeedbackApi.loginFeedback(patrolId, pin),
  });
}

export function useTakeoverFeedback(patrolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => FeedbackApi.takeoverFeedback(deviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.feedbackScope(patrolId) });
    },
  });
}

// ---------- organizer ----------

export function useRaceFeedback(raceId: string, enabled = true) {
  return useQuery({
    queryKey: qk.raceFeedback(raceId),
    queryFn: () => FeedbackApi.listRaceFeedback(raceId),
    enabled,
  });
}

export function useReopenFeedback(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feedbackId, reason }: { feedbackId: string; reason: string }) =>
      FeedbackApi.reopenFeedback(feedbackId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.raceFeedback(raceId) });
      qc.invalidateQueries({ queryKey: qk.results(raceId) });
    },
  });
}

export function useResetPatrolFeedbackPin(raceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patrolId: string) => FeedbackApi.resetPatrolFeedbackPin(patrolId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.patrols(raceId) });
    },
  });
}
