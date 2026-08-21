"use client";

import { EmptyState } from "@/components/ui/empty-state";
import type { DashboardPatrolRow, DashboardStationRow } from "@/lib/api/types";
import { useDashboard } from "@/lib/queries/dashboard";
import { fromNowFormat } from "@/lib/utils";

export function OverviewTab({ raceId }: { raceId: string }) {
  const { data: dashboardData } = useDashboard(raceId, { refetchInterval: 10_000 });
  const patrols = dashboardData?.patrols ?? [];
  const totalPatrols = patrols.length;
  const totalStations = dashboardData?.stations.length ?? 0;
  const allEntries = patrols.reduce((sum, patrol) => sum + patrol.stations_done, 0);
  const maxEntries = totalPatrols * totalStations;
  const progress = maxEntries > 0 ? Math.round((allEntries / maxEntries) * 100) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 sm:gap-3.5">
      <ScoringProgressCard
        done={allEntries}
        total={maxEntries}
        progress={progress}
        patrols={totalPatrols}
        stations={totalStations}
      />
      <div className="grid min-h-0 flex-1 grid-rows-2 gap-2.5 sm:gap-3.5 lg:grid-cols-2 lg:grid-rows-1">
        <PatrolTableCard patrols={patrols} totalStations={totalStations} />
        <StationTableCard stations={dashboardData?.stations ?? []} totalPatrols={totalPatrols} />
      </div>
    </div>
  );
}

/**
 * Postup hodnocení. Nejdůležitější číslo na dashboardu — organizátor
 * podle něj pozná, jestli závod běží tak, jak má.
 */
function ScoringProgressCard({
  done,
  total,
  progress,
  patrols,
  stations,
}: {
  done: number;
  total: number;
  progress: number;
  patrols: number;
  stations: number;
}) {
  return (
    <section className="shrink-0 rounded-12 border border-scout-border bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-0.6 text-scout-text-muted">
            Hodnocení
          </div>
          <div className="mt-0.5 text-22 font-bold leading-none tabular-nums text-scout-text">
            {done} / {total}{" "}
            <span className="text-14 font-normal text-scout-text-muted">dokončeno</span>
          </div>
        </div>
        <div className="text-26 font-bold leading-none tabular-nums text-scout-blue">{progress} %</div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-scout-bg-track">
        <div
          className={`h-full transition-all ${progress >= 100 ? "bg-scout-green" : "bg-scout-blue"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-2 flex gap-4 text-12 text-scout-text-muted">
        <span><span className="font-semibold text-scout-text">{patrols}</span> hlídek</span>
        <span><span className="font-semibold text-scout-text">{stations}</span> stanovišť</span>
      </div>
    </section>
  );
}

function PatrolTableCard({ patrols, totalStations }: { patrols: DashboardPatrolRow[]; totalStations: number }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-12 border border-scout-border bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-scout-border px-3 py-2.5 sm:px-4.5 sm:py-3">
        <span className="text-13 font-semibold text-scout-text">Postup hlídek</span>
        <span className="text-11 text-scout-text-muted">{patrols.length} celkem</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {patrols.length === 0 ? (
          <EmptyState className="m-4 border-none bg-transparent py-10" title="Žádné hlídky" description="V tabu Hlídky je importuj z CSV nebo přidej ručně." />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-scout-bg-table">
                {["Hlídka", "Stanovišť", "Body", "Poslední aktivita"].map((header, index) => (
                  <th key={header} className={`border-b border-scout-border px-3 py-2 text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted ${index < 1 ? "text-left" : "w-[20%] text-right"}`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...patrols].sort((a, b) => b.total_points - a.total_points).map((patrol, index) => (
                <tr key={patrol.id} className={`border-b border-scout-border ${index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"}`}>
                  <td className="px-2.5 py-2.5 text-13 font-semibold text-scout-text sm:px-3 sm:py-3">{patrol.name}</td>
                  <td className="px-3 py-2.25 text-right"><MiniProgress done={patrol.stations_done} total={totalStations} /></td>
                  <td className="px-3 py-2.25 text-right text-14 font-bold tabular-nums text-scout-text">{patrol.total_points}</td>
                  <td className="px-3 py-2.25 text-right text-11 text-scout-text">{fromNowFormat(patrol.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function StationTableCard({ stations, totalPatrols }: { stations: DashboardStationRow[]; totalPatrols: number }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-12 border border-scout-border bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-scout-border px-3 py-2.5 sm:px-4.5 sm:py-3">
        <span className="text-13 font-semibold text-scout-text">Průběh stanovišť</span>
        <span className="text-11 text-scout-text-muted">{stations.length} celkem</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {stations.length === 0 ? (
          <EmptyState className="m-4 border-none bg-transparent py-10" title="Žádná stanoviště" description="V tabu Stanoviště je definuj a pak spusť závod." />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-scout-bg-table">
                {["Stanoviště", "Hlídky", "Zbývá"].map((header, index) => (
                  <th key={header} className={`border-b border-scout-border px-3 py-2 text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted ${index === 0 ? "text-left" : "w-[24%] text-right"}`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...stations].sort((a, b) => a.position - b.position).map((station, index) => (
                <tr key={station.id} className={`border-b border-scout-border ${index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"}`}>
                  <td className="px-2.5 py-2.5 text-13 font-semibold text-scout-text sm:px-3 sm:py-3">
                    <span className="mr-1.5 text-11 font-normal text-scout-text-muted">#{station.position}</span>
                    {station.name}
                  </td>
                  <td className="px-3 py-2.25 text-right">
                    <MiniProgress done={station.patrols_processed} total={totalPatrols} />
                  </td>
                  <td className="px-3 py-2.25 text-right text-13 font-semibold tabular-nums text-scout-text">
                    {station.pending}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function MiniProgress({ done, total }: { done: number; total: number }) {
  const percentage = total > 0 ? done / total : 0;
  const color = percentage >= 1
    ? "bg-scout-green"
    : percentage >= 0.67
      ? "bg-scout-blue"
      : percentage >= 0.34
        ? "bg-scout-amber"
        : "bg-scout-text-muted";

  return (
    <div className="flex items-center justify-end gap-1.5">
      <div className="h-1.25 w-full overflow-hidden rounded-full bg-scout-bg-track">
        <div className={`h-full ${color}`} style={{ width: `${percentage * 100}%` }} />
      </div>
      <span className={`min-w-8.5 text-right text-12 tabular-nums ${percentage >= 1 ? "text-scout-green" : "text-scout-text-secondary"}`}>
        {done}/{total}
      </span>
    </div>
  );
}
