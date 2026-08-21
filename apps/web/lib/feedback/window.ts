/**
 * Zbývající čas okna zpětné vazby. Musí odpovídat serverovému pravidlu
 * `Api.Feedback.ensure_feedback_open/2` — okno běží od pozdějšího
 * z časů `closed_at` a `reopened_at` a trvá 12 hodin.
 */

export const FEEDBACK_WINDOW_HOURS = 12;

export function windowDeadline(
  closedAt?: string | null,
  reopenedAt?: string | null
): number | null {
  const times = [closedAt, reopenedAt]
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((time) => Number.isFinite(time));

  if (times.length === 0) return null;
  return Math.max(...times) + FEEDBACK_WINDOW_HOURS * 60 * 60 * 1000;
}

export function windowRemainingMs(
  raceState: string,
  closedAt?: string | null,
  reopenedAt?: string | null,
  now: number = Date.now()
): number | null {
  // Dokud závod běží, žádný odpočet neběží — okno se otevře až uzavřením.
  if (raceState !== "closed") return null;
  const deadline = windowDeadline(closedAt, reopenedAt);
  if (deadline === null) return null;
  const remaining = deadline - now;
  return remaining > 0 ? remaining : 0;
}

export function formatWindowRemaining(
  raceState: string,
  closedAt?: string | null,
  reopenedAt?: string | null,
  now: number = Date.now()
): string | null {
  const remaining = windowRemainingMs(raceState, closedAt, reopenedAt, now);
  if (remaining === null || remaining <= 0) return null;

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `Formulář jde uzavřít ještě ${hours} h ${minutes} min`;
}
