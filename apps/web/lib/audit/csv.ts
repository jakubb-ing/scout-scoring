import type { AuditLogEntry } from "@/lib/api/types";

/**
 * Převod historie změn do CSV. Export je jediná cesta, jak dostat audit
 * log ven při odvolací námitce — proto sedí sloupce s tím, co je vidět
 * v panelu, a escapování musí přežít i důvod s čárkou a uvozovkami.
 */

export const AUDIT_CSV_HEADER = [
  "cas",
  "kdo",
  "akce",
  "hlidka",
  "stanoviste",
  "puvodne",
  "nove",
  "duvod",
] as const;

export const ACTION_LABELS: Record<string, string> = {
  "score.create": "zápis bodů",
  "score.update": "změna bodů",
  "score.delete": "smazání zápisu",
  "score.correct": "oprava bodů",
  "score.correct_delete": "smazání při opravě",
  "race.prepare": "příprava závodu",
  "race.unprepare": "návrat do přípravy",
  "race.activate": "spuštění závodu",
  "race.close": "uzavření závodu",
  "race.reissue_tokens": "nové QR kódy",
  "patrol.withdraw": "stažení hlídky",
  "patrol.restore": "vrácení hlídky",
  "feedback.started": "začátek zpětné vazby",
  "feedback.submitted": "odevzdání zpětné vazby",
  "feedback.resubmitted": "opětovné odevzdání",
  "feedback.reopened": "odemčení zpětné vazby",
  "feedback.taken_over": "převzetí zařízením",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function formatActor(actor?: string): string {
  if (actor?.startsWith("station:")) return "stanoviště";
  if (actor?.startsWith("patrol:")) return "doprovod";
  if (actor?.startsWith("organizer:")) return "organizátor";
  return actor ?? "—";
}

export function formatTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("cs-CZ");
}

export function reasonOf(row: AuditLogEntry): string {
  const reason = row.payload?.reason;
  return typeof reason === "string" ? reason : "";
}

export function escapeCsv(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function auditRowToCsv(row: AuditLogEntry, names: Map<string, string>): string[] {
  const payload = row.payload ?? {};
  const patrolId = typeof payload.patrol === "string" ? payload.patrol : null;
  const stationId = typeof payload.station === "string" ? payload.station : null;

  return [
    formatTime(row.at),
    formatActor(row.actor),
    actionLabel(row.action),
    patrolId ? names.get(patrolId) ?? patrolId : "",
    stationId ? names.get(stationId) ?? stationId : "",
    typeof payload.before_total === "number" ? String(payload.before_total) : "",
    typeof payload.after_total === "number" ? String(payload.after_total) : "",
    reasonOf(row),
  ];
}

export function buildAuditCsv(rows: AuditLogEntry[], names: Map<string, string>): string {
  return [AUDIT_CSV_HEADER as unknown as string[], ...rows.map((r) => auditRowToCsv(r, names))]
    .map((cols) => cols.map(escapeCsv).join(","))
    .join("\r\n");
}

/** Excel bez BOM zobrazí diakritiku rozbitě. */
export const CSV_BOM = "﻿";

export function auditCsvFilename(raceId: string): string {
  return `historie-zmen-${raceId.replace(/[^A-Za-z0-9]/g, "-")}.csv`;
}
