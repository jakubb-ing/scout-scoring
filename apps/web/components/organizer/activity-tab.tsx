"use client";

import { EmptyState } from "@/components/ui/empty-state";
import type { DashboardActivityRow } from "@/lib/api/types";
import { useDashboard } from "@/lib/queries/dashboard";
import { fromNowFormat } from "@/lib/utils";

export function ActivityTab({ raceId }: { raceId: string }) {
  const { data, isFetching } = useDashboard(raceId, { refetchInterval: 10_000 });
  const activity = [...(data?.activity ?? [])]
    .filter((item) => item.activity_at)
    .sort((a, b) => new Date(b.activity_at ?? 0).getTime() - new Date(a.activity_at ?? 0).getTime());

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-12 border border-scout-border bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-scout-border px-3 py-2.5 sm:px-4.5 sm:py-3">
        <div>
          <h2 className="text-13 font-semibold text-scout-text">Live aktivita</h2>
          <p className="mt-0.5 text-11 text-scout-text-muted">Poslední zápisy bodů ze stanovišť</p>
        </div>
        <span className="text-11 text-scout-text-muted">{isFetching ? "načítám" : "↻ 10 s"}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activity.length === 0 ? (
          <EmptyState className="m-4 border-none bg-transparent py-12" title="Zatím bez aktivity" description="První zapsané body se objeví tady." />
        ) : (
          activity.map((item, index) => (
            <ActivityRow key={item.id} item={item} alternate={index % 2 !== 0} />
          ))
        )}
      </div>
    </section>
  );
}

function ActivityRow({ item, alternate }: { item: DashboardActivityRow; alternate: boolean }) {
  return (
    <div className={`grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-x-2.5 border-b border-scout-border px-3 py-2.5 sm:grid-cols-[auto,minmax(0,1fr),minmax(0,1fr),auto,5rem] sm:px-4.5 sm:py-3 ${alternate ? "bg-scout-bg-subtle" : "bg-white"}`}>
      <span className={`h-2 w-2 rounded-full ${isRecentActivity(item.activity_at) ? "bg-scout-green" : "bg-scout-blue-light"}`} />

      <div className="min-w-0">
        <div className="truncate text-13 font-semibold text-scout-text">
          {item.station_position != null ? `#${item.station_position} ` : ""}
          {item.station_name ?? "Neznámé stanoviště"}
        </div>
        <div className="truncate text-11 text-scout-text-muted sm:hidden">{formatPatrol(item)}</div>
      </div>

      <div className="hidden min-w-0 sm:block">
        <div className="truncate text-13 text-scout-text">{formatPatrol(item)}</div>
      </div>

      <div className="text-right text-14 font-bold tabular-nums text-scout-blue">{item.points} b.</div>
      <div className="col-start-2 mt-0.5 text-11 text-scout-text-muted sm:col-auto sm:mt-0 sm:text-right">
        {fromNowFormat(item.activity_at)}
      </div>
    </div>
  );
}

function formatPatrol(item: DashboardActivityRow) {
  const startNumber = item.patrol_start_number != null ? `#${item.patrol_start_number} ` : "";
  return `${startNumber}${item.patrol_name ?? "Neznámá hlídka"}`;
}

function isRecentActivity(value?: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time < 2 * 60 * 1000;
}
