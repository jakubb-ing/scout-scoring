/**
 * Central registry of TanStack Query keys.
 * Pattern: arrays prefixed by resource, nested by scope (raceId, etc.).
 * Invalidate a subtree by passing the prefix — see mutations/*.ts.
 */
export const qk = {
  me: ["me"] as const,
  users: ["users"] as const,
  user: (id: string) => ["users", id] as const,
  userRaces: (id: string) => ["users", id, "races"] as const,
  races: {
    all: ["races"] as const,
    detail: (id: string) => ["races", id] as const,
  },
  categories: (raceId: string) => ["categories", raceId] as const,
  patrols: (raceId: string) => ["patrols", raceId] as const,
  stations: (raceId: string) => ["stations", raceId] as const,
  raceMembers: (raceId: string) => ["race-members", raceId] as const,
  dashboard: (raceId: string) => ["dashboard", raceId] as const,
  leaderboard: (raceId: string) => ["leaderboard", raceId] as const,
  results: (raceId: string) => ["results", raceId] as const,
  // Station keys jsou scoped na stationId — s persistovanou offline cache
  // by se jinak data z předchozího stanoviště namapovala na nové.
  stationScope: (stationId: string) => ["station", "by-id", stationId] as const,
  stationMe: (stationId: string) => ["station", "by-id", stationId, "me"] as const,
  stationEntries: (stationId: string) => ["station", "by-id", stationId, "entries"] as const,
  stationRaces: ["station", "races"] as const,
  feedbackScope: (patrolId: string) => ["feedback", "by-id", patrolId] as const,
  feedbackMe: (patrolId: string) => ["feedback", "by-id", patrolId, "me"] as const,
  raceFeedback: (raceId: string) => ["race-feedback", raceId] as const,
  stationOptions: (raceId: string) => ["station", "races", raceId, "stations"] as const,
};
