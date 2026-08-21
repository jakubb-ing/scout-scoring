"use client";

import * as React from "react";
import { Check, ChevronRight, CloudUpload } from "lucide-react";
import { CategoryBadge } from "@/components/category-badge";
import { cn } from "@/lib/utils";
import type { Patrol, ScoreEntry } from "@/lib/api/types";
import { useEffect, useMemo, useRef } from "react";

/**
 * Seznam hlídek na stanovišti. Rozhodčí hledá očima podle startovního
 * čísla, ne psaním — vyhledávací pole tu bylo jen na překážku (otevíralo
 * klávesnici a ukrajovalo z výšky seznamu).
 */
export function PatrolPicker({
  className,
  patrols,
  entries,
  selectedId,
  highlightId,
  onSelect,
}: {
  className?: string;
  patrols: Patrol[];
  entries: ScoreEntry[];
  selectedId: string | null;
  /** Hlídka, u které se právě uložil zápis — krátce se zvýrazní. */
  highlightId?: string | null;
  onSelect: (id: string) => void;
}) {
  const doneIds = useMemo(() => new Set(entries.map((e) => e.patrol)), [entries]);
  const pendingIds = useMemo(
    () => new Set(entries.filter((e) => e._pending).map((e) => e.patrol)),
    [entries]
  );
  const pointsByPatrol = useMemo(() => {
    const byPatrol = new Map<string, number>();

    for (const entry of entries) {
      const points = (entry.scores ?? []).reduce((sum, score) => sum + (Number(score.points) || 0), 0);
      byPatrol.set(entry.patrol, points);
    }

    return byPatrol;
  }, [entries]);

  const sorted = useMemo(
    () => [...patrols].sort((a, b) => a.start_number - b.start_number),
    [patrols]
  );
  const waiting = sorted.filter((p) => !doneIds.has(p.id));
  const done = sorted.filter((p) => doneIds.has(p.id));

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <ProgressSummary done={done.length} total={sorted.length} />

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <SectionLabel>Čekají na odbavení ({waiting.length})</SectionLabel>
        {waiting.map((p) => (
          <PatrolRow
            key={p.id}
            patrol={p}
            selected={selectedId === p.id}
            highlighted={highlightId === p.id}
            done={false}
            points={pointsByPatrol.get(p.id) ?? 0}
            onSelect={onSelect}
          />
        ))}

        <SectionLabel>Odbaveno ({done.length})</SectionLabel>
        {done.map((p) => (
          <PatrolRow
            key={p.id}
            patrol={p}
            selected={selectedId === p.id}
            highlighted={highlightId === p.id}
            done
            pending={pendingIds.has(p.id)}
            points={pointsByPatrol.get(p.id) ?? 0}
            onSelect={onSelect}
          />
        ))}

        {sorted.length === 0 ? (
          <div className="py-8 text-center text-13 text-scout-text-muted">
            Na tomhle závodě zatím nejsou žádné hlídky.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProgressSummary({ done, total }: { done: number; total: number }) {
  const waiting = Math.max(0, total - done);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="-mx-3.5 shrink-0 border-b border-scout-border bg-white px-3.5 py-2.5 sm:mx-0 sm:rounded-12 sm:border">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-15 font-bold tabular-nums text-scout-text">
          {done} / {total} <span className="font-normal text-scout-text-muted">odbaveno</span>
        </div>
        <div className="text-12 tabular-nums text-scout-text-muted">
          {waiting > 0 ? `${waiting} čeká` : "hotovo"}
        </div>
      </div>
      <div className="mt-2 h-1.25 overflow-hidden rounded-full bg-scout-bg-track">
        <div
          className={cn("h-full transition-all", waiting === 0 ? "bg-scout-green" : "bg-scout-blue")}
          style={{ width: `${pct}%` }}
        />
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
  highlighted = false,
  done,
  pending = false,
  points,
  onSelect,
}: {
  patrol: Patrol;
  selected: boolean;
  highlighted?: boolean;
  done: boolean;
  pending?: boolean;
  points: number;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Po uložení se hlídka přesune do sekce „Odbaveno" — doskrolovat na ni,
    // ať rozhodčí vidí, že se zápis opravdu propsal.
    if (highlighted) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(patrol.id)}
      className={cn(
        "mb-1.75 flex w-full items-center gap-3 rounded-10 border-1.5 bg-white px-3.5 py-3 text-left transition",
        done
          ? pending
            ? "border-scout-yellow-border opacity-75"
            : "border-scout-green-border opacity-75"
          : "border-scout-border",
        selected && "ring-2 ring-scout-blue",
        highlighted && "!opacity-100 ring-2 ring-scout-green ring-offset-1"
      )}
    >
      <span
        className={cn(
          "grid h-11.5 w-11.5 shrink-0 place-items-center rounded-10 text-18 font-bold tabular-nums text-white",
          done ? (pending ? "bg-scout-yellow text-scout-text" : "bg-scout-green") : "bg-scout-blue"
        )}
      >
        {patrol.start_number}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-15 font-semibold text-scout-text">{patrol.name}</span>
        <span className="mt-1 block truncate">
          <CategoryBadge label={patrol.category_name ?? formatCategory(patrol.category)} />
        </span>
      </span>

      {done ? (
        pending ? (
          // Zápis čeká v outboxu na odeslání — jiný odstín než odeslané.
          <span className="inline-flex shrink-0 flex-col items-end gap-0.5 text-scout-text-muted">
            <span className="inline-flex items-center gap-1 text-15 font-bold tabular-nums">
              <CloudUpload className="h-3.5 w-3.5" />
              {points} b.
            </span>
            <span className="text-2xs">čeká na odeslání</span>
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-15 font-bold tabular-nums text-scout-green">
            <Check className="h-4 w-4" />
            {points} b.
          </span>
        )
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
