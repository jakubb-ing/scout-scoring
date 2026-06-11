// Mirrors the Elixir API response shapes (lib/api_web/controllers/*).
// Kept loose (optional fields) to tolerate shape drift during backend dev.

export interface Organizer {
  id: string;
  email: string;
  name?: string;
  is_admin?: boolean;
}

export interface LoginResponse {
  token: string;
  organizer: Organizer;
}

export type RaceState = "draft" | "active" | "closed";

export interface Race {
  id: string;
  name: string;
  owner?: string;
  date?: string | null;
  location?: string | null;
  state: RaceState;
  scoring_model?: "sum_points" | "sum_ranks" | "points_plus_time" | string;
  time_tracking?: "none" | "per_station" | "start_finish" | string;
  created_at?: string;
  updated_at?: string;
  access_role?: "owner" | "edit" | "read";
}

export interface RaceMember {
  id: string;
  role: "read" | "edit";
  organizer_id: string;
  email: string;
  name?: string;
}

export interface CreateOrganizerResponse {
  organizer: Organizer;
  password: string;
}

export interface UserRaceAssignment {
  race_id: string;
  role: "owner" | "edit" | "read";
  membership_id?: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug?: string;
  race?: string;
}

export interface Patrol {
  id: string;
  race?: string;
  start_number: number;
  name: string;
  category?: string | null;
  members?: string[];
  selfservice_code?: string | null;
}

export interface StationCriterion {
  id?: number | string;
  name: string;
  max_points: number;
}

export interface Station {
  id: string;
  race?: string;
  name: string;
  position: number;
  allow_half_points?: boolean;
  criteria: StationCriterion[];
  is_active: boolean;
  pin?: string;
  token_nonce?: string | null;
  access_token_hash?: string;
  access_token_raw?: string;
  qr_url?: string; // built client-side from window.location.origin for Login Cards
}

export interface PublicStationRace {
  id: string;
  name: string;
  held_on?: string | null;
  date?: string | null;
  location?: string | null;
}

export interface PublicStationOption {
  id: string;
  name: string;
  position: number;
}

export interface ScoreCriterionValue {
  criterion: string;
  points: number;
}

export interface ScoreEntry {
  id: string;
  station: string;
  patrol: string;
  scores: ScoreCriterionValue[];
  arrived_at?: string | null;
  departed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  submitted_by?: string;
}

export interface DashboardPatrolRow {
  id: string;
  start_number: number;
  name: string;
  category?: string | null;
  stations_done: number;
  total_points: number;
  last_activity?: string | null;
}

export interface DashboardStationRow {
  id: string;
  name: string;
  position: number;
  is_active: boolean;
  patrols_processed: number;
  pending: number;
}

export interface DashboardActivityRow {
  id: string;
  patrol_id: string;
  patrol_name?: string | null;
  patrol_start_number?: number | null;
  station_id: string;
  station_name?: string | null;
  station_position?: number | null;
  points: number;
  activity_at?: string | null;
}

export interface DashboardPayload {
  race: Race;
  patrols: DashboardPatrolRow[];
  stations: DashboardStationRow[];
  activity?: DashboardActivityRow[];
}

export interface LeaderboardRow {
  patrol_id: string;
  start_number: number;
  name: string;
  category?: string | null;
  category_name?: string | null;
  stations_done?: number;
  total_points: number;
  rank?: number;
  scored?: boolean;
}

export interface LeaderboardGroup {
  category_id: string;
  category_name: string;
  scored: boolean;
  rows: LeaderboardRow[];
}

export interface ResultsPayload {
  race: Race;
  stations: Station[];
  patrols: Patrol[];
  score_entries: ScoreEntry[];
  leaderboard: LeaderboardGroup[];
}

// Station (judge) endpoint types
export interface StationMePayload {
  station: {
    id: string;
    name: string;
    allow_half_points?: boolean;
    criteria: StationCriterion[];
    race: string;
  };
  patrols: Patrol[];
}

// Shape the BE returns on /races/:id/activate — loose on purpose, FE renders what's present.
export interface ActivationPayload {
  race: Race;
  stations: (Station & { access_token_raw?: string })[];
}

// AI import (POST /api/races/:race_id/ai-import/*).
export interface AiImportStationDraft {
  name: string;
  position: number;
  allow_half_points?: boolean;
  criteria: StationCriterion[];
}

export interface AiImportQuestion {
  id: string;
  question: string;
  context?: string | null;
}

export interface AiImportExtractResponse {
  document_excerpt: string;
  draft_stations: AiImportStationDraft[];
  questions: AiImportQuestion[];
}

export interface AiImportRefineResponse {
  stations: AiImportStationDraft[];
}

export interface BulkCreateStationsResponse {
  created: number;
  data: Station[];
}
