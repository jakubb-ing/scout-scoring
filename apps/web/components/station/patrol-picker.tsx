"use client";

import * as React from "react";
import { Check, ChevronRight, Search } from "lucide-react";
import { CategoryBadge } from "@/components/category-badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Patrol, ScoreEntry } from "@/lib/api/types";
import { useMemo, useState } from "react";

export function PatrolPicker({
  className,
  patrols,
  entries,
  selectedId,
  onSelect,
}: {
  className?: string;
  patrols: Patrol[];
  entries: ScoreEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const doneIds = useMemo(() => new Set(entries.map((e) => e.patrol)), [entries]);
  const pointsByPatrol = useMemo(() => {
    const byPatrol = new Map<string, number>();

    for (const entry of entries) {
      const points = (entry.scores ?? []).reduce((sum, score) => sum + (Number(score.points) || 0), 0);
      byPatrol.set(entry.patrol, points);
    }

    return byPatrol;
  }, [entries]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sorted = [...patrols].sort((a, b) => a.start_number - b.start_number);
    if (!needle) return sorted;
    return sorted.filter((p) =>
      String(p.start_number).includes(needle) || p.name.toLowerCase().includes(needle)
    );
  }, [patrols, q]);
  const waiting = filtered.filter((p) => !doneIds.has(p.id));
  const done = filtered.filter((p) => doneIds.has(p.id));

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="-mx-3.5 border-b border-scout-border bg-white px-3.5 py-2.5 sm:mx-0 sm:rounded-12 sm:border">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-scout-text-muted" />
          <Input
            placeholder="Číslo nebo název hlídky…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 rounded-10 bg-scout-bg-app pl-10 text-14 shadow-none"
            inputMode="search"
            autoFocus
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <SectionLabel>Čekají na odbavení ({waiting.length})</SectionLabel>
        {waiting.map((p) => (
          <PatrolRow key={p.id} patrol={p} selected={selectedId === p.id} done={false} points={pointsByPatrol.get(p.id) ?? 0} onSelect={onSelect} />
        ))}
        <SectionLabel>Odbaveno ({done.length})</SectionLabel>
        {done.map((p) => (
          <PatrolRow key={p.id} patrol={p} selected={selectedId === p.id} done points={pointsByPatrol.get(p.id) ?? 0} onSelect={onSelect} />
        ))}
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-13 text-scout-text-muted">
            Žádná hlídka nenalezena.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-0 py-2 text-11 font-semibold uppercase tracking-0.6 text-scout-text-muted">{children}</div>;
}

function PatrolRow({
  patrol,
  selected,
  done,
  points,
  onSelect,
}: {
  patrol: Patrol;
  selected: boolean;
  done: boolean;
  points: number;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(patrol.id)}
      className={cn(
        "mb-1.75 flex w-full items-center gap-3 rounded-10 border-1.5 bg-white px-3.5 py-3 text-left transition",
        done ? "border-scout-green-border opacity-75" : "border-scout-border",
        selected && "ring-2 ring-scout-blue"
      )}
    >
      <span className={`grid h-10.5 w-10.5 shrink-0 place-items-center rounded-10 text-16 font-bold tabular-nums text-white ${done ? "bg-scout-green" : "bg-scout-blue"}`}>
        {patrol.start_number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-15 font-semibold text-scout-text">{patrol.name}</span>
        <span className="mt-1 block truncate">
          <CategoryBadge label={patrol.category_name ?? formatCategory(patrol.category)} />
        </span>
      </span>
      {done ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-12 font-bold text-scout-green">
          <Check className="h-3.5 w-3.5" />
          {points} b.
        </span>
      ) : (
        <ChevronRight className="h-4.5 w-4.5 shrink-0 text-scout-text-muted" />
      )}
    </button>
  );
}

function formatCategory(category?: string | null) {
  if (!category) return "Bez kategorie";
  const normalized = category.toLowerCase();
  if (normalized === "d") return "Dívčí";
  if (normalized === "ch") return "Chlapecká";
  if (normalized === "n") return "Nesoutěžní";
  // Record ID kategorie není pro rozhodčí čitelné — radši nic neukazovat.
  if (normalized.startsWith("category:")) return "Bez kategorie";
  return category;
}
