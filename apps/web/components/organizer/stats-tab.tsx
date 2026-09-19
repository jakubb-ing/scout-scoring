"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { BarChart3, Download, AlertTriangle, Check, Loader2 } from "lucide-react";
import { useRaceStats } from "@/lib/queries/dashboard";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { RaceStatsPayload, RaceStatsStation } from "@/lib/api/types";
import {
  axisRange,
  axisTickStep,
  cadenceStep,
  formatSpan,
  gapStats,
  hhmm,
  resolveEntryTime,
} from "@/lib/stats/timeline";

// ─── MATH HELPERS ────────────────────────────────────────────────────────────

const mean = (a: number[]): number =>
  a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

const sd = (a: number[]): number => {
  if (a.length <= 1) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2))) || 0;
};

const quant = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

const cov = (a: number[], b: number[]): number => {
  if (a.length === 0) return 0;
  const ma = mean(a);
  const mb = mean(b);
  return mean(a.map((v, i) => (v - ma) * (b[i] - mb)));
};

const corr = (a: number[], b: number[]): number => {
  const sda = sd(a);
  const sdb = sd(b);
  if (sda === 0 || sdb === 0) return 0;
  return cov(a, b) / (sda * sdb);
};

const nf = (v: number | null | undefined, d = 1): string =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(d).replace(".", ",");

function verdict(s: { share: number; sdPct: number }) {
  if (s.share < 3 || s.sdPct < 4) {
    return { label: "NEROZLIŠUJE", bg: "#F1EFEA", color: "#8A7E66" };
  }
  if (s.share >= 16) {
    return { label: "ROZHODLO ZÁVOD", bg: "#FDF0D7", color: "#8A5B00" };
  }
  return { label: "Přispívá", bg: "#EBF1FA", color: "#294885" };
}

const zColor = (z: number | null | undefined) => {
  if (z == null) return { bg: "#F3F1EC", fg: "#8E97A4" };
  const t = Math.max(-2.2, Math.min(2.2, z)) / 2.2;
  if (t >= 0) {
    return {
      bg: `rgba(32,100,155,${(0.1 + t * 0.72).toFixed(2)})`,
      fg: t > 0.45 ? "#fff" : "#18202E",
    };
  }
  return {
    bg: `rgba(234,97,74,${(0.1 + -t * 0.68).toFixed(2)})`,
    fg: -t > 0.5 ? "#fff" : "#18202E",
  };
};

const DEFAULT_CATEGORY_COLORS = ["#294885", "#8A5B00", "#008836", "#7A6040", "#6E6252"];

function getCategoryColor(index: number, catName?: string | null, isNonScored?: boolean) {
  if (isNonScored) return "#6E6252";
  const lower = (catName || "").toLowerCase();
  // Boy categories: "klučičí" contains "kluč" (not "kluc" — č ≠ c)
  if (lower.includes("kluč") || lower.includes("kluk") || lower.includes("chlap") || lower === "ch") return "#294885";
  // Girl categories: "holčičí" contains "holč"
  if (lower.includes("dívč") || lower.includes("holč") || lower.includes("dívk") || lower === "d") return "#8A5B00";
  return DEFAULT_CATEGORY_COLORS[index % DEFAULT_CATEGORY_COLORS.length];
}

// ─── PRIMITIVES ──────────────────────────────────────────────────────────────

function Card({
  title,
  sub,
  right,
  children,
  className = "",
}: {
  title?: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col rounded-12 border border-scout-border bg-white ${className}`}>
      {title && (
        <div className="flex items-baseline gap-2.5 border-b border-scout-border px-4 py-2.5">
          <span className="text-13 font-semibold text-scout-text">{title}</span>
          {sub && <span className="text-11 text-scout-text-muted">{sub}</span>}
          <div className="flex-1" />
          {right}
        </div>
      )}
      <div className="flex-1 min-h-0 p-3.5 sm:p-4">{children}</div>
    </div>
  );
}

function Tag({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span
      className="inline-block rounded-20 px-2 py-0.75 text-2xs font-bold whitespace-nowrap"
      style={{ backgroundColor: bg, color }}
    >
      {children}
    </span>
  );
}

// ─── MAIN STATS TAB COMPONENT ────────────────────────────────────────────────

export function StatsTab({ raceId }: { raceId: string }) {
  const { data, isLoading, error } = useRaceStats(raceId);
  const [subTab, setSubTab] = useState<"stanoviste" | "hlidky" | "provoz">("stanoviste");

  // Selected station index for Stanoviště detail
  const [selectedStationIdx, setSelectedStationIdx] = useState(0);

  // Selected station index for Provoz detail — drží se zvlášť, ať se výběr
  // na jedné podzáložce nepřepisuje klikáním na druhé.
  const [selectedLaneIdx, setSelectedLaneIdx] = useState(0);

  // Parse and calculate all statistics once data is loaded
  const statsData = useMemo(() => {
    if (!data || data.stations.length === 0 || data.patrols.length === 0) {
      return null;
    }

    const { stations, patrols, categories, entries, race } = data;
    const activePatrols = patrols.filter((p) => !p.withdrawn);

    // Build a stable color map: catId -> color, based on global category order.
    // This ensures "klučičí" and "holčičí" always get distinct colors regardless
    // of how many scored categories there are.
    const colorMap = new Map<string, string>();
    categories.forEach((cat, globalIdx) => {
      colorMap.set(cat.id, getCategoryColor(globalIdx, cat.name, cat.scored === false));
    });

    if (activePatrols.length === 0 || stations.length === 0) {
      return null;
    }

    // Lookup entry by patrolId and stationId
    const entryMap = new Map<string, typeof entries[0]>();
    entries.forEach((e) => {
      entryMap.set(`${e.patrol_id}:${e.station_id}`, e);
    });

    // Score matrix M[patrolIdx][stationIdx] -> number | null
    const M: (number | null)[][] = activePatrols.map((p) =>
      stations.map((st) => {
        const e = entryMap.get(`${p.id}:${st.id}`);
        return e ? e.total_points : null;
      })
    );

    const activePatrolIds = new Set(activePatrols.map((p) => p.id));

    // Columns per station
    const COLS = stations.map((st, j) => {
      const raw = M.map((r) => r[j]);
      const have = raw.filter((v): v is number => v !== null);
      const mu = have.length > 0 ? mean(have) : 0;
      return { raw, have, mu, filled: raw.map((v) => (v === null ? mu : v)) };
    });

    // Total points per patrol
    const TOT = activePatrols.map((_, i) => COLS.reduce((s, c) => s + c.filled[i], 0));
    const TOTMAX = stations.reduce((s, st) => s + st.max_points, 0);
    const varTot = sd(TOT) ** 2;

    // Station statistics
    const STAT = stations.map((st, j) => {
      const c = COLS[j];
      const maxPts = st.max_points > 0 ? st.max_points : 1;
      const pct =
        c.have.length > 0
          ? c.have.map((v) => (v / maxPts) * 100).sort((a, b) => a - b)
          : [0];

      const minVal = pct[0];
      const maxVal = pct[pct.length - 1];
      const q1Val = quant(pct, 0.25);
      const medVal = quant(pct, 0.5);
      const q3Val = quant(pct, 0.75);

      const stSd = sd(c.have);
      const share = varTot > 0 ? (cov(c.filled, TOT) / varTot) * 100 : 0;
      const r = corr(c.filled, TOT);

      // Missing patrols for this station
      const missing = activePatrols
        .filter((_, i) => c.raw[i] === null)
        .map((p) => p.name);

      // Criteria averages and achievement ratios. Počítáme ze stejné množiny
      // hlídek jako zbytek statistiky stanoviště — odstoupené sem nepatří.
      const stEntries = entries.filter(
        (e) => e.station_id === st.id && activePatrolIds.has(e.patrol_id)
      );

      const critBreakdown = st.criteria.map((crit) => {
        // Zápis klíčuje kritérium názvem; starší data mohou nést id.
        const pts = stEntries.map(
          (e) => e.criteria[crit.name] ?? e.criteria[String(crit.id)] ?? 0
        );
        const critAvg = pts.length > 0 ? mean(pts) : 0;
        const cmax = crit.max_points > 0 ? crit.max_points : 1;
        const ach = critAvg / cmax;
        return {
          name: crit.name,
          max: crit.max_points,
          ach,
          avg: critAvg,
          hasData: pts.length > 0,
        };
      });

      return {
        ...st,
        j,
        n: c.have.length,
        mu: c.mu,
        muPct: (c.mu / maxPts) * 100,
        sd: stSd,
        sdPct: (stSd / maxPts) * 100,
        box: { min: minVal, q1: q1Val, med: medVal, q3: q3Val, max: maxVal },
        share,
        r,
        missing,
        critBreakdown,
      };
    });

    const maxShare = Math.max(...STAT.map((s) => s.share), 1);

    // Patrol rankings
    const RANK = activePatrols
      .map((p, i) => ({ ...p, i, total: TOT[i] }))
      .sort((a, b) => b.total - a.total)
      .map((p, k) => ({ ...p, rank: k + 1 }));

    const byIdx = (i: number) => RANK.find((p) => p.i === i) || RANK[0];
    const WINNER = RANK[0];

    // Patrol stats (z-scores, consistency, what-if)
    const PSTAT = activePatrols.map((p, i) => {
      const zs = stations.map((st, j) => {
        const val = M[i][j];
        if (val === null) return null;
        const stSd = sd(COLS[j].have);
        return stSd > 0 ? (val - COLS[j].mu) / stSd : 0;
      });

      const pctOfMax = stations
        .map((st, j) => {
          const val = M[i][j];
          if (val === null) return null;
          return st.max_points > 0 ? (val / st.max_points) * 100 : 0;
        })
        .filter((v): v is number => v !== null);

      const r = byIdx(i);

      // What-if: each patrol drops their worst station (in % of max)
      const worstJ = stations
        .map((st, j) => ({
          j,
          p: M[i][j] === null ? 999 : st.max_points > 0 ? (M[i][j]! / st.max_points) * 100 : 0,
        }))
        .sort((a, b) => a.p - b.p)[0]?.j ?? 0;

      return {
        ...p,
        i,
        rank: r.rank,
        total: r.total,
        zs,
        worstJ,
        cons: sd(pctOfMax),
        pctl:
          activePatrols.length > 1
            ? Math.round(((activePatrols.length - r.rank) / (activePatrols.length - 1)) * 100)
            : 100,
        gap: WINNER ? WINNER.total - r.total : 0,
      };
    });

    // Category aggregates
    const scoredCategories = categories.filter((c) => c.scored !== false);
    const catAggregates = scoredCategories
      .map((cat) => {
        const g = RANK.filter((p) => p.category_id === cat.id)
          .map((p) => p.total)
          .sort((a, b) => a - b);
        if (g.length === 0) return null;
        return {
          catId: cat.id,
          name: cat.name,
          color: colorMap.get(cat.id) ?? "#294885",
          n: g.length,
          mu: mean(g),
          med: quant(g, 0.5),
          best: g[g.length - 1],
          worst: g[0],
          sd: sd(g),
          vals: g,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const nonScoredPatrolsCount = activePatrols.filter((p) => !p.category_scored).length;

    const totalScoredEntries = COLS.reduce((s, c) => s + c.have.length, 0);

    // ── Provoz: časová osa zápisů ──
    const patrolIdxById = new Map(activePatrols.map((p, i) => [p.id, i]));

    const PROV = stations.map((st, j) => {
      const rows = entries
        .filter((e) => e.station_id === st.id && patrolIdxById.has(e.patrol_id))
        .map((e) => {
          const t = resolveEntryTime(e);
          if (t === null) return null;
          const i = patrolIdxById.get(e.patrol_id) as number;
          const p = activePatrols[i];
          return {
            i,
            id: e.patrol_id,
            name: p.name,
            startNumber: p.start_number,
            categoryId: p.category_id ?? null,
            t: t.minutes,
            estimated: t.estimated,
            score: e.total_points,
            pct: st.max_points > 0 ? (e.total_points / st.max_points) * 100 : 0,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => a.t - b.t);

      const times = rows.map((r) => r.t);
      const { med: gapMed, max: gapMax } = gapStats(times);

      return {
        ...st,
        j,
        rows,
        first: times.length > 0 ? times[0] : null,
        last: times.length > 0 ? times[times.length - 1] : null,
        gapMed,
        gapMax,
        estimatedCount: rows.filter((r) => r.estimated).length,
        // Stanoviště, kde všechny zápisy nesou jen čas synchronizace a sedí
        // ve stejné minutě, o provozu nevypovídají nic.
        syncOnly:
          rows.length > 1 &&
          rows.every((r) => r.estimated) &&
          times[times.length - 1] - times[0] <= 1,
      };
    });

    const allTimes = PROV.flatMap((s) => s.rows.map((r) => r.t));
    const axis = axisRange(allTimes);
    const estimatedTotal = PROV.reduce((sum, s) => sum + s.estimatedCount, 0);

    return {
      PROV,
      axis,
      estimatedTotal,
      race,
      stations,
      patrols: activePatrols,
      categories,
      entries,
      M,
      COLS,
      TOT,
      TOTMAX,
      STAT,
      maxShare,
      RANK,
      PSTAT,
      catAggregates,
      nonScoredPatrolsCount,
      totalScoredEntries,
      colorMap,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center text-scout-text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data || !statsData) {
    return (
      <EmptyState
        title="Nedostatek dat pro statistiku"
        description="Závod nemá žádná zapsaná hodnocení nebo chybí hlídky a stanoviště."
      />
    );
  }

  const {
    stations,
    patrols,
    STAT,
    maxShare,
    COLS,
    PSTAT,
    catAggregates,
    nonScoredPatrolsCount,
    totalScoredEntries,
    TOT,
    TOTMAX,
    RANK,
    M,
    race,
    PROV,
    axis,
    estimatedTotal,
  } = statsData;

  const currentStation = STAT[selectedStationIdx] || STAT[0];
  const currentLane = PROV[selectedLaneIdx] || PROV[0];

  // CSV export handler
  const handleExportCsv = () => {
    const headers = [
      "Pořadí (analytické)",
      "Startovní číslo",
      "Hlídka",
      "Kategorie",
      ...stations.map((s) => s.name),
      "Celkem bodů",
    ];

    const rows = PSTAT.map((p) => [
      p.rank,
      p.start_number,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${(p.category_name || "").replace(/"/g, '""')}"`,
      ...stations.map((_, j) => (M[p.i][j] != null ? M[p.i][j] : "")),
      p.total,
    ]);

    const csvContent =
      "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `statistiky-${race.name || "zavod"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3.5 pb-8">
      {/* ── Top Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Pill switcher */}
        <div className="inline-flex rounded-10 bg-scout-bg-track p-0.75">
          {([
            ["stanoviste", "Stanoviště"],
            ["hlidky", "Hlídky"],
            ["provoz", "Provoz"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`cursor-pointer rounded-8 px-4.5 py-1.75 text-13 transition ${
                subTab === key
                  ? "bg-white font-bold text-scout-blue shadow-sm"
                  : "font-medium text-scout-text-secondary hover:text-scout-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <span className="text-11.5 text-scout-text-muted">
          Počítáno z {totalScoredEntries} zápisů · {patrols.length} hlídek · {stations.length}{" "}
          stanovišť
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          className="border-scout-border text-12.5 font-medium text-scout-text-secondary hover:bg-white hover:text-scout-text"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <div className="text-2xs text-scout-text-muted">
        Pořadí v této záložce je analytické (chybějící zápisy jsou pro potřeby statistiky
        nahrazeny průměrem stanoviště).
      </div>

      {/* ── Subtab 1: Stanoviště ── */}
      {subTab === "stanoviste" ? (
        <div className="flex flex-col gap-3.5">
          {/* Box plots */}
          <Card
            title="Rozdělení bodů podle stanoviště"
            sub="normalizováno na % maxima"
          >
            <BoxPlots
              stat={STAT}
              selectedIdx={selectedStationIdx}
              onSelect={setSelectedStationIdx}
            />
          </Card>

          {/* Discrimination table */}
          <Card
            title="Rozlišovací schopnost stanovišť"
            sub="klikni na řádek pro detail"
            right={
              <span className="text-2xs text-scout-text-muted">
                σ ≈ 0 → stanoviště nerozlišuje
              </span>
            }
            className="overflow-hidden p-0"
          >
            <div className="-m-3.5 sm:-m-4 overflow-x-auto">
              <DiscriminationTable
                stat={STAT}
                maxShare={maxShare}
                patrolCount={patrols.length}
                selectedIdx={selectedStationIdx}
                onSelect={setSelectedStationIdx}
              />
            </div>
          </Card>

          {/* Detail header */}
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <span className="text-14 font-bold text-scout-text">
              Detail — {currentStation.position} · {currentStation.name}
            </span>
            <Tag
              bg={verdict(currentStation).bg}
              color={verdict(currentStation).color}
            >
              {verdict(currentStation).label}
            </Tag>
            <span className="text-11.5 text-scout-text-muted">
              Ø {nf(currentStation.mu, 2)} / {currentStation.max_points} b. · σ{" "}
              {nf(currentStation.sd, 2)} · r = {nf(currentStation.r, 2)}
            </span>
          </div>

          {/* Detail cards (3 columns) */}
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
            <Card
              title="Rozpad na kritéria"
              className="lg:col-span-5"
            >
              <CriteriaBreak
                criteria={currentStation.critBreakdown}
                patrolCount={patrols.length}
              />
            </Card>

            <Card
              title="Histogram rozložení"
              className="lg:col-span-4"
            >
              <Histogram
                station={currentStation}
                values={COLS[currentStation.j].have}
              />
            </Card>

            <Card
              title="Provoz stanoviště"
              className="lg:col-span-3"
            >
              <OpsCard
                station={currentStation}
                patrolCount={patrols.length}
                timeTrackingEnabled={race.time_tracking !== "none"}
              />
            </Card>
          </div>
        </div>
      ) : subTab === "hlidky" ? (
        /* ── Subtab 2: Hlídky ── */
        <div className="flex flex-col gap-3.5">
          {/* Category comparison header */}
          <div>
            <div className="text-15 font-bold text-scout-text">
              Srovnání kategorií hlídek
            </div>
            <div className="mt-0.5 text-11.5 text-scout-text-muted">
              {catAggregates.map((c) => `${c.name} (${c.n} hlídek)`).join(" vs ")} ·
              celkové skóre
              {nonScoredPatrolsCount > 0
                ? ` · ${nonScoredPatrolsCount} nesoutěžní hlídka mimo srovnání`
                : ""}
            </div>
          </div>

          {/* Category summary cards */}
          {catAggregates.length > 0 && <CatSummary aggregates={catAggregates} />}

          {/* Direct comparison and key diffs (pairwise if >= 2 categories) */}
          {catAggregates.length >= 2 && (
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
              <Card
                title="Přímé srovnání metrik"
                className="lg:col-span-7"
              >
                <MetricCompare
                  pair={[catAggregates[0], catAggregates[1]]}
                />
              </Card>

              <Card
                title="Klíčové rozdíly"
                className="lg:col-span-5"
              >
                <KeyDiffs
                  pair={[catAggregates[0], catAggregates[1]]}
                  rank={RANK}
                />
              </Card>
            </div>
          )}

          {/* Range bars */}
          {catAggregates.length > 0 && (
            <Card
              title="Rozsah skóre hlídek"
              sub="min → max, průměr, medián"
            >
              <RangeBars aggregates={catAggregates} />
            </Card>
          )}

          {/* Totals histogram */}
          <Card
            title="Rozložení celkových skóre"
            sub="barva = kategorie"
          >
            <TotalsHistogram
              rank={RANK}
              totMax={TOTMAX}
              categories={statsData.categories}
              colorMap={statsData.colorMap}
            />
          </Card>

          {/* Heatmap */}
          <Card
            title="Heatmapa hlídka × stanoviště"
            sub="z-skóre v rámci stanoviště"
          >
            <Heatmap
              pstat={PSTAT}
              stations={stations}
            />
          </Card>
        </div>
      ) : (
        /* ── Subtab 3: Provoz ── */
        <div className="flex flex-col gap-3.5">
          {estimatedTotal > 0 && (
            <div className="flex items-start gap-1.5 rounded-10 border border-[#F0E0BB] bg-[#FBF6EA] px-3 py-2 text-11.5 leading-relaxed text-[#7A5C1E]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {estimatedTotal} z {totalScoredEntries} zápisů nemá ručně zadaný čas průchodu
                — kreslí se podle času odeslání na server. U stanoviště, které bylo offline,
                to je čas synchronizace, ne skutečný provoz. Takové body mají prstenec místo
                plného kolečka.
              </span>
            </div>
          )}

          <Card
            title="Časová osa zápisů"
            sub="všechna stanoviště · klikni na řádek pro zvýraznění"
            right={
              <span className="text-2xs text-scout-text-muted">barva = skóre v % maxima</span>
            }
          >
            <StationLanes
              prov={PROV}
              axis={axis}
              selectedIdx={selectedLaneIdx}
              onSelect={setSelectedLaneIdx}
            />
          </Card>

          {currentLane && (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-14 font-bold text-scout-text">
                  Detail — {currentLane.position} · {currentLane.name}
                </span>
                <span className="text-11.5 text-scout-text-muted">
                  {currentLane.first != null && currentLane.last != null
                    ? `${hhmm(currentLane.first)}–${hhmm(currentLane.last)} · ${currentLane.rows.length} zápisů`
                    : "bez zápisů"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
                <Card title="Provozní přehled" className="lg:col-span-4">
                  <ProvozSummary lane={currentLane} patrolCount={patrols.length} />
                </Card>

                <Card
                  title="Kadence zápisů"
                  sub={
                    currentLane.rows.length > 0
                      ? `po ${cadenceStep(axis.t1 - axis.t0)} minutách`
                      : undefined
                  }
                  className="lg:col-span-8"
                >
                  <Cadence lane={currentLane} axis={axis} />
                </Card>
              </div>

              <Card
                title="Pořadí zápisů"
                sub={`${currentLane.name} · odstup od předchozího zápisu`}
              >
                <ProvozTable lane={currentLane} colorMap={statsData.colorMap} />
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── STANOVIŠTĚ: BOX PLOTS ───────────────────────────────────────────────────

function BoxPlots({
  stat,
  selectedIdx,
  onSelect,
}: {
  stat: Array<ReturnType<typeof verdict> & any>;
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex pl-28 pr-13">
        {[0, 25, 50, 75, 100].map((t) => (
          <div
            key={t}
            className={`relative text-2xs text-scout-text-secondary whitespace-nowrap ${
              t === 100 ? "flex-none" : "flex-1"
            }`}
          >
            <span
              className="absolute"
              style={{
                left: t === 100 ? "auto" : 0,
                right: t === 100 ? 0 : "auto",
                transform: t === 0 ? "none" : "translateX(-50%)",
              }}
            >
              {t === 100 ? "100 %" : t}
            </span>
          </div>
        ))}
      </div>

      {stat.map((s) => {
        const on = selectedIdx === s.j;
        return (
          <div
            key={s.id}
            onClick={() => onSelect(s.j)}
            className={`flex h-7.5 cursor-pointer items-center rounded-6 transition ${
              on ? "bg-[#F5F8FD]" : "hover:bg-scout-bg-subtle"
            }`}
          >
            <div
              className={`w-52 pl-1.5 text-11.5 whitespace-nowrap overflow-hidden text-ellipsis border-r ${
                on ? "font-bold text-scout-blue" : "font-medium text-scout-text"
              }`}
            >
              <span className="text-2xs text-scout-text-muted">{s.position} </span>
              {s.name}
            </div>

            <div className="relative h-5.5 flex-1">
              {[25, 50, 75].map((t) => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 w-px bg-scout-bg-track"
                  style={{ left: `${t}%` }}
                />
              ))}

              {/* Min to Max line */}
              <div
                className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-scout-border-mid"
                style={{
                  left: `${s.box.min}%`,
                  width: `${Math.max(s.box.max - s.box.min, 0.5)}%`,
                }}
              />

              {/* Min & Max caps */}
              {[s.box.min, s.box.max].map((v: number, k: number) => (
                <div
                  key={k}
                  className="absolute top-1 bottom-1 w-0.5 bg-scout-border-mid"
                  style={{ left: `${v}%` }}
                />
              ))}

              {/* Q1-Q3 box */}
              <div
                className="absolute top-0.5 bottom-0.5 rounded-3 border-1.5"
                style={{
                  left: `${s.box.q1}%`,
                  width: `${Math.max(s.box.q3 - s.box.q1, 0.5)}%`,
                  backgroundColor: on ? "#BDD3F0" : "#DCE6F4",
                  borderColor: on ? "#294885" : "#6B96CA",
                }}
              />

              {/* Median bar */}
              <div
                className="absolute top-0 bottom-0 w-0.5 rounded-2 bg-scout-blue"
                style={{ left: `${s.box.med}%` }}
              />
            </div>

            <div className="w-13 pr-1.5 text-right text-11 text-scout-text-secondary tabular-nums">
              {nf(s.muPct, 0)} %
            </div>
          </div>
        );
      })}

      <div className="mt-2 text-2xs text-scout-text-secondary">
        Normalizováno na % maxima stanoviště — 20b. a 30b. stanoviště jsou tak porovnatelná.
        Box = 25.–75. percentil, čára = medián.
      </div>
    </div>
  );
}

// ─── STANOVIŠTĚ: TABULKA ROZLIŠOVACÍ SCHOPNOSTI ──────────────────────────────

function DiscriminationTable({
  stat,
  maxShare,
  patrolCount,
  selectedIdx,
  onSelect,
}: {
  stat: Array<any>;
  maxShare: number;
  patrolCount: number;
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const headers = [
    "Stanoviště",
    "Zápisů",
    "Ø bodů",
    "Ø % max",
    "σ (b.)",
    "σ (% max)",
    "Podíl na rozptylu",
    "Korelace s pořadím",
    "",
  ];

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-scout-bg-table">
          {headers.map((h, i) => (
            <th
              key={h + i}
              className={`border-b border-scout-border px-2.5 py-1.75 text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted ${
                i === 0 ? "text-left" : i === headers.length - 1 ? "text-right" : "text-right"
              }`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {stat.map((s, k) => {
          const v = verdict(s);
          const on = selectedIdx === s.j;
          return (
            <tr
              key={s.id}
              onClick={() => onSelect(s.j)}
              className={`cursor-pointer border-b border-scout-border transition hover:bg-[#F0F5FC] ${
                on
                  ? "bg-[#F0F5FC] shadow-[inset_3px_0_0_#294885]"
                  : k % 2 === 1
                  ? "bg-scout-bg-subtle"
                  : "bg-white"
              }`}
            >
              <td className="px-2.5 py-1.75 text-12 font-semibold text-scout-text">
                <span className="text-scout-text-muted font-normal">{s.position} · </span>
                {s.name}
                <span className="text-11 font-normal text-scout-text-secondary whitespace-nowrap">
                  {" "}
                  / max {s.max_points}
                </span>
              </td>
              <td className="px-2.5 py-1.75 text-right text-12 tabular-nums text-scout-text">
                {s.n}/{patrolCount}
              </td>
              <td className="px-2.5 py-1.75 text-right text-12 tabular-nums text-scout-text">
                {nf(s.mu, 1)}
              </td>
              <td className="px-2.5 py-1.75 text-right text-12 tabular-nums text-scout-text">
                {nf(s.muPct, 0)} %
              </td>
              <td
                className={`px-2.5 py-1.75 text-right text-12 tabular-nums ${
                  s.sdPct < 4 ? "text-scout-text-secondary" : "text-scout-text"
                }`}
              >
                {nf(s.sd, 2)}
              </td>
              <td
                className={`px-2.5 py-1.75 text-right text-12 tabular-nums ${
                  s.sdPct < 4 ? "text-scout-text-secondary" : "text-scout-text"
                }`}
              >
                {nf(s.sdPct, 1)} %
              </td>

              <td className="w-40 px-2.5 py-1.75">
                <div className="flex items-center justify-end gap-1.75">
                  <div className="h-1.5 w-18 overflow-hidden rounded-3 bg-scout-bg-track">
                    <div
                      className={`h-full ${
                        s.share < 3
                          ? "bg-scout-border-mid"
                          : s.share >= 16
                          ? "bg-scout-yellow"
                          : "bg-scout-blue"
                      }`}
                      style={{ width: `${Math.max((s.share / maxShare) * 100, 1)}%` }}
                    />
                  </div>
                  <span
                    className={`w-10 text-right text-12 font-bold tabular-nums ${
                      s.share < 3 ? "text-scout-text-secondary" : "text-scout-text"
                    }`}
                  >
                    {nf(s.share, 1)}%
                  </span>
                </div>
              </td>

              <td
                className={`px-2.5 py-1.75 text-right text-12 font-semibold tabular-nums ${
                  Math.abs(s.r) < 0.25
                    ? "text-scout-text-secondary"
                    : s.r >= 0.6
                    ? "text-scout-blue"
                    : "text-scout-text"
                }`}
              >
                r = {nf(s.r, 2)}
              </td>

              <td className="px-2.5 py-1.75 text-right">
                <Tag bg={v.bg} color={v.color}>
                  {v.label}
                </Tag>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── STANOVIŠTĚ: DETAIL (kritéria / histogram / provoz) ──────────────────────

function CriteriaBreak({
  criteria,
  patrolCount,
}: {
  criteria: Array<{ name: string; max: number; ach: number; avg: number; hasData: boolean }>;
  patrolCount: number;
}) {
  return (
    <div>
      {criteria.map((c) => {
        // Bez jediného zápisu není co hodnotit — nula bodů je něco jiného
        // než chybějící data a nesmí spustit varování.
        const zero = c.hasData && c.ach === 0;
        return (
          <div key={c.name} className="mb-3 last:mb-0">
            <div className="mb-1 flex items-baseline justify-between">
              <span
                className={`text-12 font-medium ${
                  zero ? "text-scout-red font-semibold" : "text-scout-text"
                }`}
              >
                {c.name}
              </span>
              <span className="text-11.5 text-scout-text-secondary tabular-nums">
                {c.hasData ? `Ø ${nf(c.avg, 1)} / ${c.max} b.` : `bez zápisů · max ${c.max} b.`}
              </span>
            </div>
            <div className="h-2.25 overflow-hidden rounded-4 bg-scout-bg-track">
              <div
                className={`h-full ${
                  zero
                    ? "bg-scout-red"
                    : c.ach < 0.35
                    ? "bg-scout-red"
                    : c.ach > 0.85
                    ? "bg-scout-green"
                    : "bg-scout-blue"
                }`}
                style={{ width: `${Math.max(c.ach * 100, zero ? 0 : 1)}%` }}
              />
            </div>
            {zero && (
              <div className="mt-1.25 flex items-center gap-1 text-2xs font-semibold text-scout-red">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Nikdo z {patrolCount} hlídek nezískal ani bod — zadání nebo hodnocení je mimo.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Histogram({ station, values }: { station: any; values: number[] }) {
  const bins = 6;
  const counts = new Array(bins).fill(0);
  values.forEach((v) => {
    const maxVal = station.max_points > 0 ? station.max_points : 1;
    const b = Math.min(bins - 1, Math.floor((v / maxVal) * bins));
    counts[b]++;
  });
  const mx = Math.max(...counts, 1);

  return (
    <div>
      <div className="flex h-28 items-end gap-1.5">
        {counts.map((c, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={`text-11 font-bold ${
                c ? "text-scout-text" : "text-scout-text-muted"
              }`}
            >
              {c}
            </span>
            <div
              className={`w-full rounded-t-4 transition-all ${
                c ? "bg-scout-blue" : "bg-scout-bg-track"
              }`}
              style={{ height: `${(c / mx) * 78}px`, minHeight: c ? 4 : 2 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.25 flex gap-1.5">
        {counts.map((_, i) => (
          <div
            key={i}
            className="flex-1 text-center text-2xs text-scout-text-muted tabular-nums"
          >
            {Math.round((i / bins) * station.max_points)}–
            {Math.round(((i + 1) / bins) * station.max_points)}
          </div>
        ))}
      </div>
      <div className="mt-2 text-2xs text-scout-text-secondary">
        Rozložení bodů, {station.n} zápisů, max {station.max_points} b.
      </div>
    </div>
  );
}

function OpsCard({
  station,
  patrolCount,
  timeTrackingEnabled,
}: {
  station: any;
  patrolCount: number;
  timeTrackingEnabled: boolean;
}) {
  const opravy = station.ops.corrections_count ?? 0;
  const fronta = station.ops.queue_max_minutes;
  const prum = station.ops.avg_duration_minutes;

  const rows: [string, string, string][] = [
    [
      "Opravy zápisu",
      `${opravy}×`,
      opravy >= 4 ? "text-scout-red" : "text-scout-text",
    ],
  ];

  if (timeTrackingEnabled) {
    if (fronta != null) {
      rows.push([
        "Fronta (max čekání)",
        `${fronta} min`,
        fronta >= 12 ? "text-scout-amber font-bold" : "text-scout-text",
      ]);
    }
    if (prum != null) {
      rows.push(["Ø doba na hlídku", `${prum} min`, "text-scout-text"]);
    }
  }

  rows.push([
    "Zápisů hotovo",
    `${station.n} / ${patrolCount}`,
    station.n < patrolCount ? "text-scout-amber font-bold" : "text-scout-green font-bold",
  ]);

  return (
    <div>
      {rows.map(([label, val, colClass]) => (
        <div
          key={label}
          className="flex items-center justify-between border-b border-scout-border py-1.75 last:border-b-0"
        >
          <span className="text-12 text-scout-text-secondary">{label}</span>
          <span className={`text-13 font-bold tabular-nums ${colClass}`}>{val}</span>
        </div>
      ))}

      <div className="mt-2.5">
        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-0.6 text-scout-text-muted">
          Chybějící zápisy
        </div>
        {station.missing.length === 0 ? (
          <div className="flex items-center gap-1 text-12 font-semibold text-scout-green">
            <Check className="h-3.5 w-3.5" />
            Všechny hlídky zapsány
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {station.missing.map((name: string) => (
              <span
                key={name}
                className="rounded-6 border border-[#F0E0BB] bg-[#FDF0D7] px-2 py-1 text-11.5 font-semibold text-[#8A5B00]"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── HLÍDKY: SROVNÁNÍ KATEGORIÍ ──────────────────────────────────────────────

function CatSummary({ aggregates }: { aggregates: any[] }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {aggregates.map((a) => (
        <div
          key={a.catId}
          className="rounded-12 border border-scout-border bg-white p-3.5 sm:p-4"
          style={{ borderTop: `4px solid ${a.color}` }}
        >
          <div className="mb-1.5 flex items-center gap-1.75">
            <div className="h-2.5 w-2.5 rounded-3" style={{ backgroundColor: a.color }} />
            <span
              className="text-2xs font-bold uppercase tracking-0.8"
              style={{ color: a.color }}
            >
              {a.name}
            </span>
          </div>

          <div
            className="text-32 font-bold leading-none"
            style={{ color: a.color }}
          >
            {nf(a.mu, 1)}
          </div>
          <div className="mt-1 text-11.5 text-scout-text-secondary">
            průměrné body · {a.n} hlídek
          </div>

          <div className="mt-3 flex flex-wrap gap-4 border-t border-scout-border pt-2.5">
            <div>
              <div className="text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted">
                Nejlepší
              </div>
              <div className="text-16 font-bold tabular-nums text-scout-green">
                {nf(a.best, 0)}
              </div>
            </div>
            <div>
              <div className="text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted">
                Medián
              </div>
              <div className="text-16 font-bold tabular-nums text-scout-text">
                {nf(a.med, 1)}
              </div>
            </div>
            <div>
              <div className="text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted">
                Nejhorší
              </div>
              <div className="text-16 font-bold tabular-nums text-scout-red">
                {nf(a.worst, 0)}
              </div>
            </div>
            <div>
              <div className="text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted">
                σ odchylka
              </div>
              <div className="text-16 font-bold tabular-nums text-scout-text">
                {nf(a.sd, 2)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCompare({ pair }: { pair: [any, any] }) {
  const [catA, catB] = pair;
  const rows = [
    ["Průměr", "mu"],
    ["Medián", "med"],
    ["Nejlepší", "best"],
    ["Nejhorší", "worst"],
    ["Odchylka σ", "sd"],
  ] as const;

  return (
    <div>
      {rows.map(([label, k]) => {
        const mx = Math.max(catA[k], catB[k]) * 1.06 || 1;
        return (
          <div key={k} className="mb-2 flex items-center last:mb-0">
            {/* Left side bar (catA) */}
            <div className="flex h-5.5 flex-1 justify-end rounded-5 bg-scout-bg-track">
              <div
                className="flex items-center justify-end rounded-5 px-2"
                style={{
                  width: `${(catA[k] / mx) * 100}%`,
                  backgroundColor: catA.color,
                }}
              >
                <span className="text-11 font-bold text-white tabular-nums">
                  {nf(catA[k], k === "sd" ? 2 : 1)}
                </span>
              </div>
            </div>

            {/* Middle label */}
            <div className="w-28 shrink-0 text-center">
              <div className="text-12 font-semibold text-scout-text">{label}</div>
              <div className="text-2xs text-scout-text-muted">body</div>
            </div>

            {/* Right side bar (catB) */}
            <div className="flex h-5.5 flex-1 justify-start rounded-5 bg-scout-bg-track">
              <div
                className="flex items-center justify-start rounded-5 px-2"
                style={{
                  width: `${(catB[k] / mx) * 100}%`,
                  backgroundColor: catB.color,
                }}
              >
                <span className="text-11 font-bold text-white tabular-nums">
                  {nf(catB[k], k === "sd" ? 2 : 1)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KeyDiffs({ pair, rank }: { pair: [any, any]; rank: any[] }) {
  const [a, b] = pair;
  const lead = a.mu >= b.mu ? a : b;
  const trail = lead === a ? b : a;
  const steadier = a.sd <= b.sd ? a : b;
  const otherSteadier = steadier === a ? b : a;
  const absBest = a.best >= b.best ? a : b;
  const absWorst = a.worst <= b.worst ? a : b;

  const bestPatrol = rank.find((p) => p.total === absBest.best);

  const cards = [
    {
      t: `${lead.name} vedou o`,
      v: `+${nf(lead.mu - trail.mu, 1)}`,
      s: `bodů v průměru (+${trail.mu > 0 ? nf(((lead.mu - trail.mu) / trail.mu) * 100, 1) : 0} %)`,
      c: lead.color,
      bg: "#F5F8FD",
    },
    {
      t: `${steadier.name} jsou vyrovnanější`,
      v: `σ ${nf(steadier.sd, 2)}`,
      s: `proti ${nf(otherSteadier.sd, 2)} — menší rozptyl`,
      c: steadier.color,
      bg: "#F8F7F4",
    },
    {
      t: "Absolutně nejlepší",
      v: nf(absBest.best, 0),
      s: `${absBest.name} · ${bestPatrol ? bestPatrol.name : ""}`,
      c: "#008836",
      bg: "#EFF7F1",
    },
    {
      t: "Největší propad",
      v: nf(absWorst.worst, 0),
      s: `${absWorst.name} · ${nf(absWorst.mu - absWorst.worst, 1)} b. pod průměrem`,
      c: "#EA614A",
      bg: "#FDF1EE",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {cards.map((c) => (
        <div
          key={c.t}
          className="rounded-10 border border-scout-border p-3"
          style={{ backgroundColor: c.bg }}
        >
          <div
            className="mb-1 text-2xs font-bold uppercase tracking-0.6"
            style={{ color: c.c }}
          >
            {c.t}
          </div>
          <div
            className="text-22 font-bold tabular-nums leading-none"
            style={{ color: c.c }}
          >
            {c.v}
          </div>
          <div className="mt-1 text-11.5 text-scout-text-secondary">{c.s}</div>
        </div>
      ))}
    </div>
  );
}

function RangeBars({ aggregates }: { aggregates: any[] }) {
  const minVal = Math.min(...aggregates.map((a) => a.worst));
  const maxVal = Math.max(...aggregates.map((a) => a.best));
  const lo = Math.floor(minVal / 10) * 10 - 10;
  const hi = Math.ceil(maxVal / 10) * 10 + 10;
  const range = hi - lo || 1;

  const pos = (v: number) => ((v - lo) / range) * 100;

  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 20) {
    ticks.push(t);
  }

  return (
    <div>
      {aggregates.map((a) => (
        <div key={a.catId} className="mb-4 last:mb-0">
          <div className="mb-1.5 flex items-baseline justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-2.25 w-2.25 rounded-3" style={{ backgroundColor: a.color }} />
              <span className="text-12.5 font-bold" style={{ color: a.color }}>
                {a.name}
              </span>
            </div>
            <span className="text-11 text-scout-text-muted tabular-nums">
              rozsah {nf(a.worst, 0)} – {nf(a.best, 0)} b. · rozpětí{" "}
              {nf(a.best - a.worst, 0)} b.
            </span>
          </div>

          <div className="relative h-6.5 rounded-6 bg-scout-bg-track">
            {/* Light range band (min → max) */}
            <div
              className="absolute top-0 bottom-0 rounded-6 opacity-30"
              style={{
                left: `${pos(a.worst)}%`,
                width: `${Math.max(0, pos(a.best) - pos(a.worst))}%`,
                backgroundColor: a.color,
              }}
            />

            {/* Filled bar: worst → average; show at least 2px wide so it's always visible */}
            <div
              className="absolute top-0 bottom-0 rounded-l-6"
              style={{
                left: `${pos(a.worst)}%`,
                width: `max(2px, ${Math.max(0, pos(a.mu) - pos(a.worst))}%)`,
                backgroundColor: a.color,
              }}
            />

            {/* Average marker (circle) */}
            <div
              title="průměr"
              className="absolute top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 bg-white"
              style={{
                left: `${pos(a.mu)}%`,
                borderColor: a.color,
              }}
            />

            {/* Median line */}
            <div
              title="medián"
              className="absolute top-0.75 bottom-0.75 -ml-0.5 w-0.75 rounded-2 bg-scout-text"
              style={{ left: `${pos(a.med)}%` }}
            />
          </div>

          {/* Ticks */}
          <div className="relative h-3.5">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 text-2xs text-scout-text-muted tabular-nums"
                style={{ left: `${pos(t)}%` }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-2 flex items-center gap-4 text-2xs text-scout-text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-scout-text-muted bg-white" />
          průměr
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-scout-text" />
          medián
        </span>
        <span>světlý pruh = min–max</span>
      </div>
    </div>
  );
}

// ─── HLÍDKY: HISTOGRAM CELKOVÝCH SKÓRE ───────────────────────────────────────

function TotalsHistogram({
  rank,
  totMax,
  categories,
  colorMap,
}: {
  rank: any[];
  totMax: number;
  categories: any[];
  colorMap: Map<string, string>;
}) {
  const totals = rank.map((p) => p.total);
  const minVal = totals.length > 0 ? Math.min(...totals) : 0;
  const maxVal = totals.length > 0 ? Math.max(...totals) : 100;
  const lo = Math.floor(minVal / 10) * 10;
  const hi = Math.ceil(maxVal / 10) * 10;
  const nb = Math.max(Math.ceil((hi - lo) / 10), 1);

  // Group by category and bin
  const bins: Record<string, string[]>[] = Array.from({ length: nb }, () => ({}));

  rank.forEach((p) => {
    const b = Math.min(nb - 1, Math.max(0, Math.floor((p.total - lo) / 10)));
    const catKey = p.category_id || "default";
    if (!bins[b][catKey]) bins[b][catKey] = [];
    bins[b][catKey].push(p.name);
  });

  const binTotals = bins.map((b) => Object.values(b).reduce((acc, arr) => acc + arr.length, 0));
  const mx = Math.max(...binTotals, 1);

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap gap-3">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-3"
              style={{ backgroundColor: colorMap.get(c.id) ?? "#294885" }}
            />
            <span className="text-11 text-scout-text-secondary">{c.name}</span>
          </div>
        ))}
      </div>

      <div className="flex h-36 items-end gap-2">
        {bins.map((b, i) => {
          const n = binTotals[i];
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`text-11 font-bold ${
                  n ? "text-scout-text" : "text-scout-text-muted"
                }`}
              >
                {n || ""}
              </span>
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-t-4"
                style={{
                  height: `${(n / mx) * 110}px`,
                  minHeight: n ? 0 : 2,
                  backgroundColor: n ? "transparent" : "#EFEDE7",
                }}
              >
                {Object.entries(b).map(([catId, arr]) => {
                  const col = colorMap.get(catId) ?? "#294885";
                  return (
                    <div
                      key={catId}
                      style={{
                        height: `${(arr.length / n) * 100}%`,
                        backgroundColor: col,
                        borderTop: "1px solid rgba(255,255,255,0.7)",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1.25 flex gap-2">
        {bins.map((_, i) => (
          <div
            key={i}
            className="flex-1 text-center text-2xs text-scout-text-muted tabular-nums"
          >
            {lo + i * 10}–{lo + (i + 1) * 10 - 1}
          </div>
        ))}
      </div>

      <div className="mt-2 text-2xs text-scout-text-muted">
        Celkové maximum závodu {totMax} b.
      </div>
    </div>
  );
}

// ─── HLÍDKY: HEATMAPA ────────────────────────────────────────────────────────

function Heatmap({
  pstat,
  stations,
}: {
  pstat: any[];
  stations: RaceStatsStation[];
}) {
  return (
    <div>
      <div className="mb-1 flex gap-1 pl-40 pr-16 overflow-x-auto">
        {stations.map((st) => (
          <div
            key={st.id}
            className="flex h-7 flex-1 items-end justify-center text-center text-2xs text-scout-text-muted leading-tight"
          >
            <span className="truncate">{st.name}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 overflow-x-auto">
        {pstat.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1"
          >
            <div className="flex w-40 items-center gap-1.5 overflow-hidden pl-2">
              <span className="w-4.5 text-2xs tabular-nums text-scout-text-muted">
                {p.rank}.
              </span>
              <span className="truncate text-12 font-medium text-scout-text">
                {p.name}
              </span>
            </div>

            {p.zs.map((z: number | null, j: number) => {
              const c = zColor(z);
              const bad = z != null && z <= -2.2;
              return (
                <div
                  key={j}
                  className="relative flex h-6.5 flex-1 items-center justify-center rounded-4 text-2xs font-semibold"
                  style={{
                    backgroundColor: c.bg,
                    color: c.fg,
                    border: bad ? "1.5px solid #EA614A" : "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  {z == null ? "–" : (z > 0 ? "+" : "") + nf(z, 1)}
                  {bad && (
                    <span className="absolute -top-1.5 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-scout-red text-[8px] font-bold text-white">
                      !
                    </span>
                  )}
                </div>
              );
            })}

            <div className="w-16 pr-2 text-right text-12 font-bold tabular-nums text-scout-text">
              {nf(p.total, 0)} b.
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3.5 text-2xs text-scout-text-muted">
        <div className="flex items-center gap-1.5">
          <span>z = −2</span>
          <div className="flex">
            {[-2, -1.3, -0.6, 0, 0.6, 1.3, 2].map((z) => (
              <div
                key={z}
                className="h-2.5 w-5"
                style={{ backgroundColor: zColor(z).bg }}
              />
            ))}
          </div>
          <span>+2</span>
        </div>
        <span>„–" = chybějící zápis</span>
        <span className="font-semibold text-scout-red">
          červený rámeček = z ≤ −2,2, pravděpodobně chybný zápis
        </span>
      </div>
    </div>
  );
}


// ─── PROVOZ: ČASOVÁ OSA ZÁPISŮ ───────────────────────────────────────────────

/** Barva bodu podle skóre v % maxima — stejná škála jako v heatmapě. */
const scoreColor = (pct: number) => {
  const t = Math.max(0, Math.min(1, (pct - 35) / 60));
  return {
    bg: `rgba(32,100,155,${(0.18 + t * 0.8).toFixed(2)})`,
    fg: t > 0.45 ? "#fff" : "#18202E",
  };
};

type Lane = {
  id: string;
  name: string;
  position: number;
  max_points: number;
  rows: Array<{
    i: number;
    id: string;
    name: string;
    startNumber: number;
    categoryId: string | null;
    t: number;
    estimated: boolean;
    score: number;
    pct: number;
  }>;
  first: number | null;
  last: number | null;
  gapMed: number | null;
  gapMax: number | null;
  estimatedCount: number;
  syncOnly: boolean;
};

type Axis = { t0: number; t1: number };

function axisTicks({ t0, t1 }: Axis): number[] {
  const step = axisTickStep(t1 - t0);
  const ticks: number[] = [];
  for (let m = Math.ceil(t0 / step) * step; m <= t1; m += step) ticks.push(m);
  return ticks;
}

function StationLanes({
  prov,
  axis,
  selectedIdx,
  onSelect,
}: {
  prov: Lane[];
  axis: Axis;
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const ticks = axisTicks(axis);
  const pos = (t: number) => ((t - axis.t0) / (axis.t1 - axis.t0)) * 100;

  return (
    <div>
      {/* Osa */}
      <div className="mb-1 flex">
        <div className="w-36 shrink-0 sm:w-44" />
        <div className="relative h-3.5 flex-1">
          {ticks.map((m) => (
            <span
              key={m}
              className="absolute -translate-x-1/2 text-2xs whitespace-nowrap text-scout-text-secondary"
              style={{ left: `${pos(m)}%` }}
            >
              {hhmm(m)}
            </span>
          ))}
        </div>
        <div className="w-24 shrink-0 sm:w-28" />
      </div>

      {prov.map((s, idx) => {
        const on = selectedIdx === idx;
        return (
          <div
            key={s.id}
            onClick={() => onSelect(idx)}
            className={`mb-0.5 flex cursor-pointer items-center rounded-8 transition ${
              on ? "bg-[#F0F5FC] shadow-[inset_3px_0_0_#294885]" : "opacity-60 hover:opacity-100"
            }`}
          >
            <div className="flex w-36 shrink-0 items-center gap-1.5 overflow-hidden pl-2 sm:w-44">
              <span className="w-4 text-2xs tabular-nums text-scout-text-secondary">
                {s.position}
              </span>
              <span
                className={`truncate text-12 ${
                  on ? "font-bold text-scout-blue" : "font-medium text-scout-text"
                }`}
              >
                {s.name}
              </span>
            </div>

            <div className={`relative flex-1 ${on ? "h-10" : "h-7.5"}`}>
              {ticks.map((m) => (
                <div
                  key={m}
                  className="absolute top-0 bottom-0 w-px bg-scout-bg-track"
                  style={{ left: `${pos(m)}%` }}
                />
              ))}

              {s.first != null && s.last != null && (
                <div
                  className="absolute top-1/2 -mt-px h-0.5 rounded-2 bg-scout-border"
                  style={{ left: `${pos(s.first)}%`, width: `${pos(s.last) - pos(s.first)}%` }}
                />
              )}

              {s.rows.map((r) => {
                const c = scoreColor(r.pct);
                const d = on ? 22 : 15;
                return (
                  <div
                    key={r.id}
                    title={`${r.name} · ${hhmm(r.t)}${r.estimated ? " (čas odeslání)" : ""} · ${r.score}/${s.max_points} b.`}
                    className="absolute top-1/2 flex items-center justify-center rounded-full text-2xs font-bold shadow-sm"
                    style={{
                      left: `${pos(r.t)}%`,
                      width: d,
                      height: d,
                      marginLeft: -d / 2,
                      marginTop: -d / 2,
                      // Dopočítaný čas = prstenec, měřený = plné kolečko.
                      background: r.estimated ? "#FFFFFF" : c.bg,
                      border: r.estimated ? `2px dashed ${c.bg}` : "1.5px solid #FFFFFF",
                      color: r.estimated ? "#8A5B00" : c.fg,
                    }}
                  >
                    {on ? r.startNumber : ""}
                  </div>
                );
              })}
            </div>

            <div className="w-24 shrink-0 pr-2 text-right text-11 tabular-nums text-scout-text-secondary sm:w-28">
              {s.first != null && s.last != null
                ? `${hhmm(s.first)}–${hhmm(s.last)} · ${s.rows.length}×`
                : "bez zápisů"}
            </div>
          </div>
        );
      })}

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-scout-text-secondary">skóre 35 % max</span>
          <div className="flex">
            {[35, 50, 65, 80, 95].map((p) => (
              <div key={p} className="h-2.5 w-5" style={{ background: scoreColor(p).bg }} />
            ))}
          </div>
          <span className="text-2xs text-scout-text-secondary">95 %+</span>
        </div>
        <span className="text-2xs text-scout-text-secondary">
          Každý bod = jeden zápis výsledku, číslo ve zvýrazněném řádku = startovní číslo hlídky.
        </span>
      </div>
    </div>
  );
}

function ProvozSummary({ lane, patrolCount }: { lane: Lane; patrolCount: number }) {
  const span = lane.first != null && lane.last != null ? lane.last - lane.first : null;

  const rows: Array<[string, string, string]> = [
    ["První zápis", lane.first != null ? hhmm(lane.first) : "—", "text-scout-text"],
    ["Poslední zápis", lane.last != null ? hhmm(lane.last) : "—", "text-scout-text"],
    ["Celá směna", span != null ? formatSpan(span) : "—", "text-scout-text"],
    [
      "Zápisů",
      `${lane.rows.length} / ${patrolCount}`,
      lane.rows.length < patrolCount ? "text-scout-amber" : "text-scout-green",
    ],
    [
      "Medián odstupu",
      lane.gapMed != null ? `${nf(lane.gapMed, 0)} min` : "—",
      "text-scout-text",
    ],
    [
      "Nejdelší pauza",
      lane.gapMax != null ? `${nf(lane.gapMax, 0)} min` : "—",
      lane.gapMax != null && lane.gapMax >= 60 ? "text-scout-amber" : "text-scout-text",
    ],
  ];

  return (
    <div>
      {rows.map(([label, val, colClass]) => (
        <div
          key={label}
          className="flex items-center justify-between border-b border-scout-border py-1.75 last:border-b-0"
        >
          <span className="text-12 text-scout-text-secondary">{label}</span>
          <span className={`text-13 font-bold tabular-nums ${colClass}`}>{val}</span>
        </div>
      ))}

      {lane.syncOnly && (
        <div className="mt-2.5 flex items-start gap-1 text-2xs font-semibold leading-relaxed text-scout-red">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Všechny zápisy dorazily naráz — stanoviště bylo nejspíš offline a čísla výše
          popisují synchronizaci, ne provoz.
        </div>
      )}
    </div>
  );
}

function Cadence({ lane, axis }: { lane: Lane; axis: Axis }) {
  const step = cadenceStep(axis.t1 - axis.t0);

  const bins: Array<{ m: number; n: number }> = [];
  for (let m = axis.t0; m < axis.t1; m += step) {
    bins.push({ m, n: lane.rows.filter((r) => r.t >= m && r.t < m + step).length });
  }
  const mx = Math.max(...bins.map((b) => b.n), 1);

  if (lane.rows.length === 0) {
    return <div className="text-12 text-scout-text-muted">Stanoviště nemá žádné zápisy.</div>;
  }

  return (
    <div>
      <div className="flex h-24 items-end gap-0.75">
        {bins.map((b) => (
          <div key={b.m} className="flex flex-1 flex-col items-center gap-0.75">
            <span
              className={`text-2xs font-bold ${b.n ? "text-scout-text" : "text-transparent"}`}
            >
              {b.n || 0}
            </span>
            <div
              className={`w-full rounded-t-3 ${
                b.n === mx && mx > 1
                  ? "bg-scout-yellow"
                  : b.n
                  ? "bg-scout-blue"
                  : "bg-scout-bg-track"
              }`}
              style={{ height: `${(b.n / mx) * 68}px`, minHeight: b.n ? 3 : 2 }}
            />
          </div>
        ))}
      </div>

      <div className="mt-1 flex gap-0.75">
        {bins.map((b, k) => (
          <div key={b.m} className="flex-1 text-center text-2xs text-scout-text-secondary">
            {k % 2 === 0 ? hhmm(b.m) : ""}
          </div>
        ))}
      </div>

      <div className="mt-2.5 text-2xs leading-relaxed text-scout-text-secondary">
        Zápisy po {step} minutách. Žlutý sloupec = špička.
        {lane.gapMax != null && lane.gapMed != null ? (
          <>
            {" "}
            Nejdelší pauza mezi zápisy <b>{nf(lane.gapMax, 0)} min</b>, medián odstupu{" "}
            {nf(lane.gapMed, 0)} min.
          </>
        ) : (
          " Na odstupy je potřeba aspoň dvojice zápisů."
        )}
      </div>
    </div>
  );
}

function ProvozTable({ lane, colorMap }: { lane: Lane; colorMap: Map<string, string> }) {
  if (lane.rows.length === 0) {
    return <div className="text-12 text-scout-text-muted">Stanoviště nemá žádné zápisy.</div>;
  }

  return (
    <div className="-mx-3.5 -my-3.5 overflow-x-auto sm:-mx-4 sm:-my-4">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-scout-bg-subtle">
            {["Čas zápisu", "Hlídka", "Odstup", "Body", "% max"].map((h, k) => (
              <th
                key={h}
                className={`border-b border-scout-border px-2.5 py-1.75 text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted ${
                  k <= 1 ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lane.rows.map((r, k) => {
            const gap = k === 0 ? null : r.t - lane.rows[k - 1].t;
            // Odstup dvojnásobný proti mediánu = díra v provozu, stojí za pohled.
            const longGap = gap != null && lane.gapMed != null && gap >= lane.gapMed * 2;
            return (
              <tr
                key={r.id}
                className={`border-b border-scout-border ${k % 2 ? "bg-scout-bg-subtle" : "bg-white"}`}
              >
                <td className="px-2.5 py-1.5 text-12 font-semibold tabular-nums text-scout-text">
                  {hhmm(r.t)}
                  {r.estimated && (
                    <span
                      className="ml-1.5 text-2xs font-normal text-[#8A5B00]"
                      title="Ruční čas chybí, jde o čas odeslání na server."
                    >
                      ~
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-12 text-scout-text">
                  <span
                    className="mr-1.75 inline-block h-1.75 w-1.75 rounded-2"
                    style={{
                      background: r.categoryId ? colorMap.get(r.categoryId) ?? "#6E6252" : "#6E6252",
                    }}
                  />
                  {r.name}
                </td>
                <td
                  className={`px-2.5 py-1.5 text-right text-12 tabular-nums ${
                    longGap ? "font-bold text-scout-amber" : "text-scout-text-secondary"
                  }`}
                >
                  {gap == null ? "—" : `+${nf(gap, 0)} min`}
                </td>
                <td className="px-2.5 py-1.5 text-right text-12 font-bold tabular-nums text-scout-text">
                  {r.score}
                </td>
                <td className="px-2.5 py-1.5 text-right text-12 tabular-nums text-scout-text-secondary">
                  {nf(r.pct, 0)} %
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
