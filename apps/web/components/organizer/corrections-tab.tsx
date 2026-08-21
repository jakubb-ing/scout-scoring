"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CriteriaInputs, clamp, criterionFieldKey } from "@/components/station/criteria-inputs";
import { AuditLogPanel } from "@/components/organizer/audit-log-panel";
import { useResults, useCorrectScoreEntry } from "@/lib/queries/dashboard";
import type { Patrol, ScoreEntry, Station } from "@/lib/api/types";

/**
 * Dodatečné opravy bodů — jediná cesta, jak upravit hodnocení po uzavření
 * závodu (mimo jiné zachrání offline zápisy zablokované uzavřením).
 * Tab se zobrazuje jen u uzavřeného závodu a jen s právem editace.
 */
export function CorrectionsTab({ raceId }: { raceId: string }) {
  const { data, isLoading } = useResults(raceId);
  const [editing, setEditing] = useState<{ patrol: Patrol; station: Station } | null>(null);

  const stations = useMemo(
    () => [...(data?.stations ?? [])].sort((a, b) => a.position - b.position),
    [data?.stations]
  );
  const patrols = useMemo(
    () => [...(data?.patrols ?? [])].sort((a, b) => a.start_number - b.start_number),
    [data?.patrols]
  );
  const entries = data?.score_entries ?? [];

  const entryFor = (patrolId: string, stationId: string) =>
    entries.find((e) => e.patrol === patrolId && e.station === stationId) ?? null;

  if (isLoading) {
    return (
      <div className="rounded-12 border border-scout-border bg-white p-8 text-center text-13 text-scout-text-muted">
        Načítám…
      </div>
    );
  }

  if (stations.length === 0 || patrols.length === 0) {
    return (
      <EmptyState
        title="Není co opravovat"
        description="Závod nemá hlídky nebo stanoviště."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0">
        <h2 className="text-18 font-bold text-scout-text">Opravy bodů</h2>
        <p className="text-12 text-scout-text-muted">
          Klikni na buňku a uprav body. Každá oprava vyžaduje důvod a zapíše se
          do historie změn.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-12 border border-scout-border bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-scout-bg-table">
            <tr>
              <th className="sticky left-0 z-20 border-b border-scout-border bg-scout-bg-table px-3 py-2 text-left text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted">
                Hlídka
              </th>
              {stations.map((s) => (
                <th
                  key={s.id}
                  className="border-b border-scout-border px-3 py-2 text-right text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted"
                  title={s.name}
                >
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {patrols.map((p, index) => (
              <tr key={p.id} className={index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"}>
                <td
                  className={`sticky left-0 z-10 border-b border-scout-border px-3 py-2 text-13 font-semibold text-scout-text ${index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"}`}
                >
                  <span className="font-mono text-12 text-scout-text-muted">#{p.start_number}</span>{" "}
                  {p.name}
                  {p.withdrawn ? (
                    <span className="ml-1.5 text-2xs text-scout-text-muted">(nedostavila se)</span>
                  ) : null}
                </td>
                {stations.map((s) => {
                  const entry = entryFor(p.id, s.id);
                  return (
                    <td key={s.id} className="border-b border-scout-border px-1 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing({ patrol: p, station: s })}
                        className="w-full rounded-8 px-2 py-1.5 text-right text-13 tabular-nums transition hover:bg-scout-bg-table"
                      >
                        {entry ? (
                          <span className={entry.corrected_at ? "font-bold text-scout-amber" : "text-scout-text"}>
                            {totalPoints(entry)}
                            {entry.corrected_at ? " *" : ""}
                          </span>
                        ) : (
                          <span className="text-scout-text-muted">—</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AuditLogPanel raceId={raceId} patrols={patrols} stations={stations} />

      {editing ? (
        <CorrectionDialog
          raceId={raceId}
          patrol={editing.patrol}
          station={editing.station}
          entry={entryFor(editing.patrol.id, editing.station.id)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function CorrectionDialog({
  raceId,
  patrol,
  station,
  entry,
  onClose,
}: {
  raceId: string;
  patrol: Patrol;
  station: Station;
  entry: ScoreEntry | null;
  onClose: () => void;
}) {
  const correct = useCorrectScoreEntry(raceId);
  const criteria = useMemo(
    () => (station.criteria ?? []).map((c, index) => ({ ...c, id: index })),
    [station.criteria]
  );
  const allowHalfPoints = station.allow_half_points === true;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const [index, c] of criteria.entries()) {
      const found = entry?.scores?.find((s) => s.criterion === c.name);
      seeded[criterionFieldKey(c, index)] = found ? String(found.points) : "0";
    }
    return seeded;
  });
  const [reason, setReason] = useState("");

  const originalTotal = entry ? totalPoints(entry) : 0;
  const newTotal = criteria.reduce(
    (sum, c, index) => sum + (Number(values[criterionFieldKey(c, index)]) || 0),
    0
  );
  const reasonValid = reason.trim().length >= 3;

  async function onSubmit() {
    try {
      await correct.mutateAsync({
        station_id: station.id,
        patrol_id: patrol.id,
        scores: criteria.map((c, index) => ({
          criterion: c.name,
          points: clamp(Number(values[criterionFieldKey(c, index)]) || 0, 0, c.max_points),
        })),
        reason: reason.trim(),
      });
      toast.success(`Opraveno — ${patrol.name}, ${station.name} (${newTotal} b.)`);
      onClose();
    } catch {
      toast.error("Oprava selhala.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {patrol.name} · {station.name}
          </DialogTitle>
          <DialogDescription>
            {entry
              ? "Oprava zapsaného hodnocení. Původní hodnoty zůstávají v historii změn."
              : "Doplnění chybějícího hodnocení."}
          </DialogDescription>
        </DialogHeader>

        <CriteriaInputs
          criteria={criteria}
          values={values}
          allowHalfPoints={allowHalfPoints}
          onChange={(fieldKey, value) =>
            setValues((prev) => ({ ...prev, [fieldKey]: String(value) }))
          }
        />

        <div className="space-y-2">
          <Label htmlFor="correction-reason">Důvod opravy</Label>
          <Textarea
            id="correction-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Např. rozhodčí nahlásil body telefonicky, zápis nešel odeslat."
          />
        </div>

        <div className="rounded-10 border border-scout-border bg-scout-bg-subtle px-3 py-2 text-13">
          Původně <strong className="tabular-nums">{originalTotal}</strong> →{" "}
          nově <strong className="tabular-nums">{newTotal}</strong> bodů
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button onClick={onSubmit} disabled={!reasonValid || correct.isPending}>
            Uložit opravu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function totalPoints(entry: ScoreEntry) {
  return (entry.scores ?? []).reduce((sum, s) => sum + (Number(s.points) || 0), 0);
}
