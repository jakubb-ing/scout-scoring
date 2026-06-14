"use client";

import * as React from "react";
import { Suspense } from "react";
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResultsCodeForm } from "@/components/results/results-code-form";
import { useResultsAccess } from "@/lib/queries/results-access";
import type { ScoreEntry, Station } from "@/lib/api/types";

export default function PatrolResultsPage() {
  return (
    <Suspense fallback={<PatrolResultsLoading />}>
      <PatrolResultsContent />
    </Suspense>
  );
}

function PatrolResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raceId = searchParams.get("raceId");
  const patrolId = searchParams.get("patrolId");
  const [expandedStationId, setExpandedStationId] = React.useState<string | null>(null);
  const access = useResultsAccess(raceId);
  const data = access.data;
  const isLoading = access.mode === "loading";

  const patrol = data?.patrols.find((item) => item.id === patrolId) ?? null;
  const categoryName = data && patrol ? getCategoryName(data.leaderboard, patrol.category) : null;
  const stationRows = data && patrolId ? buildStationRows(data.stations, data.score_entries, patrolId) : [];
  const totalPoints = stationRows.reduce((sum, row) => sum + row.points, 0);

  if (raceId && access.mode === "needCode") {
    return (
      <ResultsCodeForm
        onSubmit={access.submitCode}
        error={access.codeError}
        submitting={access.submitting}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-scout-bg-app text-scout-text">
      <header className="flex shrink-0 items-center gap-2 border-b border-scout-border bg-white px-3 py-2.5 sm:gap-3 sm:px-7 sm:py-3.5">
        <Button variant="ghost" size="sm" onClick={() => router.push(raceId ? `/dashboard/results?raceId=${encodeURIComponent(raceId)}` : "/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
          Zpět
        </Button>
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-0.6 text-scout-text-muted">Detail hlídky</div>
          <h1 className="truncate text-18 font-bold text-scout-text">{patrol?.name ?? "Hlídka"}</h1>
          {categoryName ? <div className="mt-0.5 truncate text-12 text-scout-text-muted">{categoryName}</div> : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-7 sm:py-5">
        {!raceId || !patrolId ? (
          <EmptyState title="Chybí hlídka" description="Vrať se na výsledky a vyber hlídku." />
        ) : isLoading ? (
          <PatrolResultsLoading compact />
        ) : !data || !patrol ? (
          <EmptyState title="Hlídka nenalezena" description="Pro zadaný závod se nepodařilo najít detail hlídky." />
        ) : (
          <>
            <section className="rounded-12 border border-scout-border bg-white p-3 sm:p-4">
              <div className="text-2xs font-semibold uppercase tracking-0.6 text-scout-text-muted">Celkem</div>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-32 font-bold leading-none text-scout-blue">{totalPoints}</span>
                <span className="pb-1 text-13 text-scout-text-muted">bodů</span>
              </div>
            </section>

            <section className="overflow-hidden rounded-12 border border-scout-border bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-scout-border px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <h2 className="text-15 font-bold text-scout-text">Body podle stanovišť</h2>
                <span className="text-12 text-scout-text-muted">{stationRows.filter((row) => row.entry).length} / {stationRows.length}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-scout-bg-table">
                      {["Stanoviště", "Body", "Stav"].map((header, index) => (
                        <th
                          key={header}
                          className={`border-b border-scout-border px-3 py-2 text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted ${index === 0 ? "text-left" : "text-right"}`}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stationRows.map((row, index) => {
                      const expanded = expandedStationId === row.station.id;

                      return (
                        <React.Fragment key={row.station.id}>
                          <tr
                            className={`cursor-pointer border-b border-scout-border hover:bg-scout-bg-table ${index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"}`}
                            onClick={() => setExpandedStationId(expanded ? null : row.station.id)}
                          >
                            <td className="px-2 py-2 text-13 font-semibold text-scout-text sm:px-3 sm:py-2.5">
                              <span className="flex items-center gap-2">
                                <ChevronDown className={`h-4 w-4 shrink-0 text-scout-text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                                <span>{row.station.name}</span>
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right text-13 font-bold tabular-nums text-scout-blue sm:px-3 sm:py-2.5">{row.points}</td>
                            <td className="px-2 py-2 text-right text-12 text-scout-text-muted sm:px-3 sm:py-2.5">{row.entry ? "Zapsáno" : "Bez záznamu"}</td>
                          </tr>
                          {expanded ? (
                            <tr className="border-b border-scout-border bg-white">
                              <td colSpan={3} className="px-2 py-2 sm:px-3 sm:py-3">
                                <StationTaskBreakdown row={row} />
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function PatrolResultsLoading({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid place-items-center text-scout-text-muted ${compact ? "flex-1" : "min-h-screen bg-scout-bg-app"}`}>
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function buildStationRows(stations: Station[], entries: ScoreEntry[], patrolId: string) {
  const entriesByStation = new Map(entries.filter((entry) => entry.patrol === patrolId).map((entry) => [entry.station, entry]));

  return [...stations]
    .sort((a, b) => a.position - b.position)
    .map((station) => {
      const entry = entriesByStation.get(station.id) ?? null;

      return {
        station,
        entry,
        points: sumEntryPoints(entry),
      };
    });
}

function StationTaskBreakdown({ row }: { row: ReturnType<typeof buildStationRows>[number] }) {
  const tasks = buildTaskRows(row.station, row.entry);

  if (!row.entry) {
    return <div className="rounded-8 bg-scout-bg-subtle px-2.5 py-2 text-12 text-scout-text-muted sm:px-3">Na tomto stanovišti zatím nejsou zapsané body.</div>;
  }

  if (tasks.length === 0) {
    return <div className="rounded-8 bg-scout-bg-subtle px-2.5 py-2 text-12 text-scout-text-muted sm:px-3">Stanoviště nemá rozepsané podúkoly.</div>;
  }

  return (
    <div className="overflow-hidden rounded-8 border border-scout-border">
      {tasks.map((task, index) => (
        <div key={`${task.name}-${index}`} className={`flex items-center justify-between gap-2 px-2.5 py-2 sm:gap-3 sm:px-3 ${index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"}`}>
          <span className="min-w-0 truncate text-12 text-scout-text">{task.name}</span>
          <span className="shrink-0 text-12 font-bold tabular-nums text-scout-blue">{task.points} b.</span>
        </div>
      ))}
    </div>
  );
}

function buildTaskRows(station: Station, entry: ScoreEntry | null) {
  if (!entry) return [];

  return entry.scores.map((score, index) => {
    const criterion = station.criteria.find((item) => String(item.id ?? item.name) === String(score.criterion));

    return {
      name: criterion?.name ?? score.criterion,
      points: score.points ?? 0,
    };
  });
}

function sumEntryPoints(entry: ScoreEntry | null) {
  return entry?.scores.reduce((sum, score) => sum + (score.points ?? 0), 0) ?? 0;
}

function getCategoryName(leaderboard: { category_id: string; category_name: string }[], categoryId?: string | null) {
  if (!categoryId) return null;
  return leaderboard.find((group) => group.category_id === categoryId)?.category_name ?? categoryId;
}
