"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAuditLog } from "@/lib/api/dashboard";
import { useAuditLog } from "@/lib/queries/dashboard";
import type { AuditLogEntry, Patrol, Station } from "@/lib/api/types";

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;

const ACTION_LABELS: Record<string, string> = {
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
  "feedback.submitted": "odevzdání zpětné vazby",
  "feedback.reopened": "odemčení zpětné vazby",
};

export function AuditLogPanel({
  raceId,
  patrols,
  stations,
}: {
  raceId: string;
  patrols: Patrol[];
  stations: Station[];
}) {
  const [onlyCorrections, setOnlyCorrections] = useState(false);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const query = useMemo(
    () => ({
      action: onlyCorrections ? "score.correct" : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [onlyCorrections, page]
  );
  const { data, isLoading } = useAuditLog(raceId, query);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of patrols) map.set(p.id, `#${p.start_number} ${p.name}`);
    for (const s of stations) map.set(s.id, s.name);
    return map;
  }, [patrols, stations]);

  const rows = data ?? [];
  const hasNextPage = rows.length === PAGE_SIZE;

  async function onExport() {
    setExporting(true);
    try {
      // Export musí projít celou historii, ne jen zobrazenou stránku —
      // jinak by byl při námitce neúplný.
      const all: AuditLogEntry[] = [];
      for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
        const chunk = await getAuditLog(raceId, {
          action: onlyCorrections ? "score.correct" : undefined,
          limit: EXPORT_PAGE_SIZE,
          offset,
        });
        all.push(...chunk);
        if (chunk.length < EXPORT_PAGE_SIZE) break;
      }
      downloadCsv(all, names, raceId);
      toast.success(`Exportováno ${all.length} záznamů.`);
    } catch {
      toast.error("Export selhal.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="shrink-0 overflow-hidden rounded-12 border border-scout-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-scout-border px-3 py-2.5 sm:px-4">
        <h2 className="text-15 font-bold text-scout-text">Historie změn</h2>
        <div className="flex items-center gap-2">
          <Button
            variant={onlyCorrections ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setOnlyCorrections((v) => !v);
              setPage(0);
            }}
          >
            Jen opravy
          </Button>
          <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? "Exportuji…" : "Export CSV"}
          </Button>
        </div>
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {isLoading ? (
          <div className="p-6 text-center text-13 text-scout-text-muted">Načítám…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-13 text-scout-text-muted">
            {onlyCorrections ? "Zatím žádné opravy." : "Zatím žádné záznamy."}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`border-b border-scout-border ${index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-12 tabular-nums text-scout-text-muted">
                    {formatTime(row.at)}
                  </td>
                  <td className="px-3 py-2 text-12 text-scout-text-muted">{formatActor(row.actor)}</td>
                  <td className="px-3 py-2 text-12 text-scout-text">
                    {ACTION_LABELS[row.action] ?? row.action}
                  </td>
                  <td className="px-3 py-2 text-12 text-scout-text">{formatTarget(row, names)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-12 font-semibold tabular-nums text-scout-text">
                    {formatChange(row)}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-12 text-scout-text-muted" title={reasonOf(row)}>
                    {reasonOf(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {page > 0 || hasNextPage ? (
        <div className="flex items-center justify-between gap-2 border-t border-scout-border px-3 py-2">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Novější
          </Button>
          <span className="text-12 text-scout-text-muted">strana {page + 1}</span>
          <Button variant="ghost" size="sm" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
            Starší
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("cs-CZ");
}

function formatActor(actor: string) {
  if (actor?.startsWith("station:")) return "stanoviště";
  if (actor?.startsWith("patrol:")) return "doprovod";
  if (actor?.startsWith("organizer:")) return "organizátor";
  return actor ?? "—";
}

function formatTarget(row: AuditLogEntry, names: Map<string, string>) {
  const payload = row.payload ?? {};
  const patrol = typeof payload.patrol === "string" ? names.get(payload.patrol) ?? payload.patrol : null;
  const station =
    typeof payload.station === "string" ? names.get(payload.station) ?? payload.station : null;
  return [patrol, station].filter(Boolean).join(" · ") || "—";
}

function formatChange(row: AuditLogEntry) {
  const payload = row.payload ?? {};
  const before = payload.before_total;
  const after = payload.after_total;
  if (typeof before === "number" && typeof after === "number") return `${before} → ${after} b.`;
  if (typeof after === "number") return `${after} b.`;
  if (typeof before === "number") return `${before} → —`;
  return "";
}

function reasonOf(row: AuditLogEntry) {
  const reason = row.payload?.reason;
  return typeof reason === "string" ? reason : "";
}

function downloadCsv(rows: AuditLogEntry[], names: Map<string, string>, raceId: string) {
  const header = ["cas", "kdo", "akce", "hlidka", "stanoviste", "puvodne", "nove", "duvod"];
  const lines = rows.map((row) => {
    const payload = row.payload ?? {};
    const patrol = typeof payload.patrol === "string" ? names.get(payload.patrol) ?? payload.patrol : "";
    const station = typeof payload.station === "string" ? names.get(payload.station) ?? payload.station : "";
    return [
      formatTime(row.at),
      formatActor(row.actor),
      ACTION_LABELS[row.action] ?? row.action,
      patrol,
      station,
      typeof payload.before_total === "number" ? String(payload.before_total) : "",
      typeof payload.after_total === "number" ? String(payload.after_total) : "",
      reasonOf(row),
    ];
  });

  const csv = [header, ...lines]
    .map((cols) => cols.map(escapeCsv).join(","))
    .join("\r\n");

  // BOM kvůli Excelu a české diakritice.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `historie-zmen-${raceId.replace(/[^A-Za-z0-9]/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string) {
  const needsQuotes = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}
