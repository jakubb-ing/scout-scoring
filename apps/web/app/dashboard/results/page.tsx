"use client";

import * as React from "react";
import { Suspense } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResultsCodeForm } from "@/components/results/results-code-form";
import { useResultsAccess } from "@/lib/queries/results-access";
import type { LeaderboardGroup, LeaderboardRow } from "@/lib/api/types";

export default function ResultsPage() {
  return (
    <Suspense fallback={<ResultsLoading />}>
      <ResultsContent />
    </Suspense>
  );
}

function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raceId = searchParams.get("raceId");
  const access = useResultsAccess(raceId);
  const groups = access.data?.leaderboard ?? [];
  const raceName = access.raceName ?? "Závod";
  const isLoading = access.mode === "loading";
  const [resultsUrl, setResultsUrl] = React.useState("");

  React.useEffect(() => {
    setResultsUrl(window.location.href);
  }, []);

  function onExport() {
    window.print();
  }

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
    <>
      {resultsUrl
        ? createPortal(
            <PrintableResults raceName={raceName} groups={groups} resultsUrl={resultsUrl} />,
            document.body,
          )
        : null}

      <div className="flex min-h-screen flex-col bg-scout-bg-app text-scout-text">
        <header className="flex shrink-0 items-center gap-2 border-b border-scout-border bg-white px-3 py-2.5 sm:gap-3 sm:px-7 sm:py-3.5">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
            Zpět
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-2xs font-semibold uppercase tracking-0.6 text-scout-text-muted">Výsledky</div>
            <h1 className="truncate text-18 font-bold text-scout-text">{raceName}</h1>
          </div>
          <Button variant="outline" size="sm" onClick={onExport} disabled={!raceId || isLoading || groups.length === 0}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-7 sm:py-5">
          {!raceId ? (
            <EmptyState title="Chybí závod" description="Vrať se do dashboardu a vyber závod." />
          ) : isLoading ? (
            <div className="grid flex-1 place-items-center text-scout-text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : access.mode === "error" ? (
            <EmptyState title="Nepodařilo se načíst" description="Výsledky se nepodařilo načíst. Zkus to prosím znovu." />
          ) : groups.length === 0 ? (
            <EmptyState title="Žádné výsledky" description="Pro tento závod zatím nejsou dostupné výsledky." />
          ) : (
            groups.map((group) => <CategoryResultsTable key={group.category_id} group={group} raceId={raceId} />)
          )}
        </main>
      </div>
    </>
  );
}

function ResultsLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-scout-bg-app text-scout-text-muted">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function CategoryResultsTable({ group, raceId }: { group: LeaderboardGroup; raceId: string }) {
  const router = useRouter();
  const rows = sortLeaderboardRows(group.rows);

  return (
    <section className="overflow-hidden rounded-12 border border-scout-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-scout-border px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <h2 className="text-15 font-bold text-scout-text">{group.category_name}</h2>
        <span className="text-12 text-scout-text-muted">{rows.length} hlídek</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-13 text-scout-text-muted sm:px-4 sm:py-8">V kategorii nejsou žádné hlídky.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-scout-bg-table">
                {["Pořadí", "Hlídka", "Body", "Rozdíl"].map((header, index) => (
                  <th
                    key={header}
                    className={`border-b border-scout-border px-3 py-2 text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted ${index === 1 ? "text-left" : "text-right"}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.patrol_id}
                  className={`cursor-pointer border-b border-scout-border last:border-b-0 hover:bg-scout-bg-table ${index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"}`}
                  onClick={() => router.push(`/dashboard/results/patrol?raceId=${encodeURIComponent(raceId)}&patrolId=${encodeURIComponent(row.patrol_id)}`)}
                >
                  <td className="w-14 px-2 py-2 text-right text-13 font-bold tabular-nums text-scout-text sm:w-20 sm:px-3 sm:py-2.5">{formatRank(row)}</td>
                  <td className="px-2 py-2 text-13 font-semibold text-scout-text sm:px-3 sm:py-2.5">{row.name}</td>
                  <td className="px-2 py-2 text-right text-13 font-bold tabular-nums text-scout-blue sm:px-3 sm:py-2.5">{row.total_points}</td>
                  <td className="px-2 py-2 text-right text-12 tabular-nums text-scout-text-muted sm:px-3 sm:py-2.5">{formatPointGap(rows, index)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PrintableResults({ raceName, groups, resultsUrl }: { raceName: string; groups: LeaderboardGroup[]; resultsUrl: string }) {
  return (
    <div id="results-print" className="hidden">
      <div className="mb-6 flex items-start justify-between gap-6 border-b border-slate-300 pb-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Souhrn výsledků</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{raceName}</h1>
          <div className="mt-2 break-all text-[10px] text-slate-500">{resultsUrl}</div>
        </div>
        <div className="shrink-0 text-center">
          <div className="inline-block border border-slate-300 bg-white p-1.5">
            <QRCodeSVG value={resultsUrl} size={88} level="M" marginSize={1} />
          </div>
          <div className="mt-1 text-[9px] text-slate-500">Online výsledky</div>
        </div>
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <PrintableCategory key={group.category_id} group={group} />
        ))}
      </div>
    </div>
  );
}

function PrintableCategory({ group }: { group: LeaderboardGroup }) {
  const rows = sortLeaderboardRows(group.rows);

  return (
    <section className="results-category">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="text-base font-bold text-slate-900">{group.category_name}</h2>
        <span className="text-[10px] text-slate-500">{rows.length} hlídek</span>
      </div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-slate-100">
            {["Pořadí", "Hlídka", "Body", "Rozdíl"].map((header, index) => (
              <th key={header} className={`border border-slate-300 px-2 py-1.5 font-semibold uppercase text-slate-600 ${index === 1 ? "text-left" : "text-right"}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.patrol_id}>
              <td className="w-16 border border-slate-300 px-2 py-1.5 text-right font-bold tabular-nums">{formatRank(row)}</td>
              <td className="border border-slate-300 px-2 py-1.5 font-semibold">{row.name}</td>
              <td className="w-16 border border-slate-300 px-2 py-1.5 text-right font-bold tabular-nums">{row.total_points}</td>
              <td className="w-16 border border-slate-300 px-2 py-1.5 text-right tabular-nums">{formatPointGap(rows, index)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatRank(row: LeaderboardRow) {
  return row.rank ? `${row.rank}.` : "-";
}

function sortLeaderboardRows(rows: LeaderboardRow[]) {
  return [...rows].sort((a, b) => {
    const rankDiff = (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
    if (rankDiff !== 0) return rankDiff;
    return b.total_points - a.total_points;
  });
}

function formatPointGap(rows: LeaderboardRow[], index: number) {
  if (index === 0) return "-";

  const previous = rows[index - 1];
  const current = rows[index];
  const gap = previous.total_points - current.total_points;

  return gap > 0 ? `-${gap}` : "0";
}
