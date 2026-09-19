import type { RaceStatsEntry } from "@/lib/api/types";

/**
 * Časová osa podzáložky Provoz pracuje s "hodinami na stěně" — tedy s tím,
 * co by v danou chvíli ukazovaly hodiny na stanovišti.
 *
 * Zdroje času se totiž liší zónou:
 *  - `arrived_at`/`departed_at` zadává rozhodčí ručně jako HH:MM a ukládají se
 *    bez zóny (`score-form.tsx` posílá `${den}T${HH:MM}:00`), takže v databázi
 *    leží lokální čas označený jako UTC. Čteme z něj proto přímo hodiny
 *    a minuty a žádnou konverzi neděláme.
 *  - `created_at` je skutečné UTC ze serveru, takže se musí převést do
 *    lokálního času prohlížeče, jinak by body odskočily o offset zóny.
 */

/** Hodiny a minuty přečtené z řetězce tak, jak jsou — bez posunu zóny. */
export function wallClockMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/** Skutečné UTC převedené do lokálního času prohlížeče. */
export function localMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

export interface EntryTime {
  /** Minuty od půlnoci. */
  minutes: number;
  /** true = čas není měřený, spadli jsme na `created_at` (čas synchronizace). */
  estimated: boolean;
}

/**
 * Čas jednoho zápisu: ruční čas odchodu, jinak příchodu, jinak čas zápisu
 * na server. Poslední varianta je u offline stanoviště čas synchronizace,
 * a proto se označuje jako odhad.
 */
export function resolveEntryTime(entry: RaceStatsEntry): EntryTime | null {
  const departed = wallClockMinutes(entry.departed_at);
  if (departed !== null) return { minutes: departed, estimated: false };

  const arrived = wallClockMinutes(entry.arrived_at);
  if (arrived !== null) return { minutes: arrived, estimated: false };

  const created = localMinutes(entry.created_at);
  if (created !== null) return { minutes: created, estimated: true };

  return null;
}

/** Medián a maximum odstupů mezi po sobě jdoucími zápisy. */
export function gapStats(sortedMinutes: number[]): {
  med: number | null;
  max: number | null;
} {
  if (sortedMinutes.length < 2) return { med: null, max: null };

  const gaps = sortedMinutes
    .slice(1)
    .map((t, i) => t - sortedMinutes[i])
    .sort((a, b) => a - b);

  const mid = (gaps.length - 1) / 2;
  const lo = Math.floor(mid);
  const hi = Math.ceil(mid);
  const med = gaps[lo] + (gaps[hi] - gaps[lo]) * (mid - lo);

  return { med, max: gaps[gaps.length - 1] };
}

/**
 * Rozsah osy se odvozuje z dat, ne z pevných hodin závodu. Kolem krajních
 * zápisů se nechává rezerva a zaokrouhluje se na čtvrthodiny, aby popisky
 * padly na kulaté časy.
 */
export function axisRange(minutes: number[]): { t0: number; t1: number } {
  if (minutes.length === 0) return { t0: 8 * 60, t1: 16 * 60 };

  const min = Math.min(...minutes);
  const max = Math.max(...minutes);
  const t0 = Math.max(0, Math.floor((min - 10) / 15) * 15);
  const t1 = Math.min(24 * 60, Math.ceil((max + 10) / 15) * 15);

  // Jediný zápis (nebo všechny ve stejnou minutu) by dal nulovou šířku osy.
  if (t1 - t0 < 60) {
    const stred = (t0 + t1) / 2;
    return {
      t0: Math.max(0, Math.floor((stred - 30) / 15) * 15),
      t1: Math.min(24 * 60, Math.ceil((stred + 30) / 15) * 15),
    };
  }

  return { t0, t1 };
}

/** Šířka okna kadence tak, aby sloupců zůstalo zhruba 12–16. */
export function cadenceStep(spanMinutes: number): 15 | 30 | 60 {
  if (spanMinutes <= 3 * 60) return 15;
  if (spanMinutes <= 6 * 60) return 30;
  return 60;
}

/** Krok popisků časové osy — u krátkého závodu po půlhodině. */
export function axisTickStep(spanMinutes: number): 30 | 60 {
  return spanMinutes < 2 * 60 ? 30 : 60;
}

export function hhmm(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** „2 h 35 min" / „45 min" pro délku směny. */
export function formatSpan(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
