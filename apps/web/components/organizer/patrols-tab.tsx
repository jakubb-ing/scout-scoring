"use client";

import * as React from "react";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { CategoryBadge } from "@/components/category-badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRace } from "@/lib/queries/races";
import { useCategories } from "@/lib/queries/categories";
import {
  usePatrols,
  useCreatePatrol,
  useUpdatePatrol,
  useDeletePatrol,
  useBulkCreatePatrols,
} from "@/lib/queries/patrols";
import type { Patrol } from "@/lib/api/types";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

export function PatrolsTab({ raceId }: { raceId: string }) {
  const { data: race } = useRace(raceId);
  const { data: patrolsData, isLoading: patrolsLoading } = usePatrols(raceId);
  const { data: categoriesData } = useCategories(raceId);
  const bulkCreate = useBulkCreatePatrols(raceId);
  const deletePatrol = useDeletePatrol(raceId);

  const [editing, setEditing] = useState<Patrol | null>(null);
  const [open, setOpen] = useState(false);

  const patrols = patrolsData ?? [];
  const categories = categoriesData ?? [];
  const canModify = race?.state === "draft" && race.access_role !== "read";
  const canEdit = canModify;

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(p: Patrol) {
    setEditing(p);
    setOpen(true);
  }

  async function onDelete(p: Patrol) {
    if (!confirm(`Smazat hlídku ${p.name} (#${p.start_number})?`)) return;
    try {
      await deletePatrol.mutateAsync(p.id);
      toast.success("Hlídka smazána.");
    } catch {
      toast.error("Smazání selhalo.");
    }
  }

  async function onCsvImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error("CSV je prázdné nebo ve špatném formátu.");
      return;
    }
    try {
      const res = await bulkCreate.mutateAsync(rows);
      const n = (res as { created?: number })?.created ?? rows.length;
      toast.success(`Importováno ${n} hlídek.`);
    } catch {
      toast.error("Import selhal.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-18 font-bold text-scout-text">Hlídky</h2>
          <p className="text-12 text-scout-text-muted">
            {patrols.length} hlídek · očekává se 10–25 v okresním kole.
          </p>
        </div>
        {canModify ? (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <label className="cursor-pointer">
                <Upload className="h-4 w-4" />
                Import CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvImport} />
              </label>
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Přidat hlídku
            </Button>
          </div>
        ) : race ? (
          <p className="text-12 text-scout-text-muted">
            Závod je {race.state === "active" ? "spuštěný" : "uzavřený"} — hlídky už nejdou upravovat.
          </p>
        ) : null}
      </div>

      {patrolsLoading ? (
        <div className="rounded-12 border border-scout-border bg-white p-8 text-center text-13 text-scout-text-muted">Načítám…</div>
      ) : patrols.length === 0 ? (
        <EmptyState
          title="Žádné hlídky"
          description={
            canModify
              ? "Přidej ručně nebo importuj CSV (sloupce: start_number, name, category, members)."
              : race
                ? `Závod je ${race.state === "active" ? "spuštěný" : "uzavřený"} — nové hlídky už nejdou přidat.`
                : "Nejsou tu žádné hlídky."
          }
          action={
            canModify ? (
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" /> Přidat první hlídku
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-12 border border-scout-border bg-white">
          <div className="h-full overflow-y-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-scout-bg-table">
                  {["#", "Název", "Kategorie", "Členové", ""].map((h, i) => (
                    <th key={`${h}-${i}`} className={`border-b border-scout-border px-3 py-2 text-2xs font-semibold uppercase tracking-0.5 text-scout-text-muted ${i === 4 ? "w-24" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patrols.map((p, index) => {
                  const categoryLabel = getPatrolCategoryLabel(p, categories);

                  return (
                  <tr key={p.id} className={`border-b border-scout-border ${index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"}`}>
                    <td className="w-14 px-3 py-2.25">
                      <span className="grid h-8 w-8 place-items-center rounded-8 bg-scout-blue text-13 font-bold tabular-nums text-white">{p.start_number}</span>
                    </td>
                    <td className="px-3 py-2.25 text-13 font-semibold text-scout-text">{p.name}</td>
                    <td className="px-3 py-2.25">
                      <CategoryBadge label={categoryLabel} />
                    </td>
                    <td className="px-3 py-2.25 text-12 text-scout-text-muted">
                      {(p.members ?? []).length ? `${(p.members ?? []).length} členů` : "—"}
                    </td>
                    <td className="px-3 py-2.25">
                      <div className="flex justify-end gap-1">
                        {canEdit ? (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="Upravit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canModify ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDelete(p)}
                            aria-label="Smazat"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canEdit ? (
        <PatrolDialog
          open={open}
          onOpenChange={setOpen}
          raceId={raceId}
          categories={categories}
          patrol={editing}
          nextStartNumber={patrols.length ? Math.max(...patrols.map((p) => p.start_number)) + 1 : 1}
          onSaved={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function getPatrolCategoryLabel(patrol: Patrol, categories: { id: string; name: string }[]) {
  return categories.find((c) => c.id === patrol.category)?.name ?? patrol.category ?? "—";
}

function PatrolDialog({
  open,
  onOpenChange,
  raceId,
  categories,
  patrol,
  nextStartNumber,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  raceId: string;
  categories: { id: string; name: string }[];
  patrol: Patrol | null;
  nextStartNumber: number;
  onSaved: () => void;
}) {
  const createPatrol = useCreatePatrol(raceId);
  const updatePatrol = useUpdatePatrol(raceId);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [members, setMembers] = useState("");

  useEffect(() => {
    if (open) {
      setName(patrol?.name ?? "");
      setCategory(patrol?.category ?? "");
      setMembers((patrol?.members ?? []).join(", "));
    }
  }, [open, patrol]);

  const submitting = createPatrol.isPending || updatePatrol.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      toast.error("Zadej název hlídky.");
      return;
    }

    if (!category) {
      toast.error("Vyber kategorii hlídky.");
      return;
    }

    const payload = {
      start_number: patrol ? patrol.start_number : nextStartNumber,
      name: trimmedName,
      category,
      members: members.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (patrol) await updatePatrol.mutateAsync({ id: patrol.id, data: payload });
      else await createPatrol.mutateAsync(payload);
      toast.success(patrol ? "Hlídka upravena." : "Hlídka přidána.");
      onSaved();
    } catch {
      toast.error("Uložení selhalo.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{patrol ? "Upravit hlídku" : "Nová hlídka"}</DialogTitle>
          <DialogDescription>
            Startovní číslo se přiřadí automaticky. Členové jsou oddělení čárkou.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pname">
              Název
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Start. č. #{patrol ? patrol.start_number : nextStartNumber}
              </span>
            </Label>
            <Input id="pname" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tučňáci" />
          </div>

          <div className="space-y-2">
            <Label>Kategorie</Label>
            <Select value={category || undefined} onValueChange={setCategory}>
              <SelectTrigger className="h-10 rounded-10 border-1.5 border-scout-border bg-white text-14 text-scout-text shadow-sm">
                <SelectValue placeholder="Vyber kategorii" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="members">Členové</Label>
            <Input id="members" value={members} onChange={(e) => setMembers(e.target.value)} placeholder="Jan, Eva, Petr" />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {patrol ? "Uložit" : "Přidat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function parseCsv(text: string): Partial<Patrol>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const [header, ...rows] = lines;
  const cols = header.split(",").map((c) => c.trim().toLowerCase());
  const idx = (k: string) => cols.indexOf(k);
  return rows
    .map((line) => {
      const parts = splitCsvLine(line);
      const sn = Number(parts[idx("start_number")] ?? parts[0]);
      if (!Number.isFinite(sn)) return null;
      return {
        start_number: sn,
        name: parts[idx("name")] ?? parts[1] ?? "",
        category: parts[idx("category")] ?? null,
        members: (parts[idx("members")] ?? "")
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean),
      } as Partial<Patrol>;
    })
    .filter((x): x is Partial<Patrol> => x !== null);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
