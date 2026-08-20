"use client";

import * as React from "react";
import { Pencil, Plus, RotateCcw, Trash2, Upload, UserX } from "lucide-react";
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
  useWithdrawPatrol,
  useRestorePatrol,
} from "@/lib/queries/patrols";
import type { Patrol } from "@/lib/api/types";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

export function PatrolsTab({ raceId }: { raceId: string }) {
  const { data: race } = useRace(raceId);
  const { data: patrolsData, isLoading: patrolsLoading } = usePatrols(raceId);
  const { data: categoriesData } = useCategories(raceId);
  const bulkCreate = useBulkCreatePatrols(raceId);
  const deletePatrol = useDeletePatrol(raceId);
  const withdrawPatrol = useWithdrawPatrol(raceId);
  const restorePatrol = useRestorePatrol(raceId);

  const [editing, setEditing] = useState<Patrol | null>(null);
  const [open, setOpen] = useState(false);

  const patrols = patrolsData ?? [];
  const categories = categoriesData ?? [];
  const hasWriteRole = race != null && race.access_role !== "read";
  // Přidávání a mazání jen v draftu; editace (název + členové) i v ready;
  // stažení nedostavené hlídky v ready a active.
  const canAdd = hasWriteRole && race.state === "draft";
  const canEdit = hasWriteRole && (race.state === "draft" || race.state === "ready");
  const canWithdraw = hasWriteRole && (race.state === "ready" || race.state === "active");
  const structureLocked = race?.state === "ready";

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(p: Patrol) {
    setEditing(p);
    setOpen(true);
  }

  async function onDelete(p: Patrol) {
    // Po prepare má hlídka vydané PINy — smazání a znovuzaložení dostane
    // nové (missing_only chrání jen existující záznamy), vytištěná karta
    // by tiše přestala platit.
    const printedWarning = race?.prepared_at
      ? "\n\nPozor: závod už prošel přípravou. Pokud má hlídka vytištěnou QR kartu, smazáním přestane platit."
      : "";
    if (!confirm(`Smazat hlídku ${p.name} (#${p.start_number})?${printedWarning}`)) return;
    try {
      await deletePatrol.mutateAsync(p.id);
      toast.success("Hlídka smazána.");
    } catch {
      toast.error("Smazání selhalo.");
    }
  }

  async function onWithdraw(p: Patrol) {
    const reason = prompt(`Stáhnout hlídku ${p.name} ze závodu?\n\nHlídka zmizí z výsledků, ale její zápisy zůstanou. Volitelně uveď důvod:`);
    if (reason === null) return;
    try {
      await withdrawPatrol.mutateAsync({ id: p.id, reason: reason.trim() || null });
      toast.success("Hlídka stažena ze závodu.");
    } catch {
      toast.error("Stažení selhalo.");
    }
  }

  async function onRestore(p: Patrol) {
    try {
      await restorePatrol.mutateAsync(p.id);
      toast.success("Hlídka vrácena do závodu.");
    } catch {
      toast.error("Vrácení selhalo.");
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
        {canAdd ? (
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
            {race.state === "ready"
              ? "Závod je připraven — jde upravit jen název a členové, přidávání je zamčené."
              : race.state === "active"
                ? "Závod je spuštěný — hlídky jde jen stáhnout ze závodu."
                : "Závod je uzavřený — hlídky už nejdou upravovat."}
          </p>
        ) : null}
      </div>

      {patrolsLoading ? (
        <div className="rounded-12 border border-scout-border bg-white p-8 text-center text-13 text-scout-text-muted">Načítám…</div>
      ) : patrols.length === 0 ? (
        <EmptyState
          title="Žádné hlídky"
          description={
            canAdd
              ? "Přidej ručně nebo importuj CSV (sloupce: start_number, name, category, members)."
              : race
                ? "Nové hlídky jdou přidat jen v přípravě závodu."
                : "Nejsou tu žádné hlídky."
          }
          action={
            canAdd ? (
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
                  <tr key={p.id} className={`border-b border-scout-border ${index % 2 === 0 ? "bg-white" : "bg-scout-bg-subtle"} ${p.withdrawn ? "opacity-60" : ""}`}>
                    <td className="w-14 px-3 py-2.25">
                      <span className={`grid h-8 w-8 place-items-center rounded-8 text-13 font-bold tabular-nums text-white ${p.withdrawn ? "bg-scout-text-muted" : "bg-scout-blue"}`}>{p.start_number}</span>
                    </td>
                    <td className="px-3 py-2.25 text-13 font-semibold text-scout-text">
                      {p.name}
                      {p.withdrawn ? (
                        <span className="ml-2 rounded-full bg-scout-bg-subtle px-2 py-0.5 text-2xs font-medium text-scout-text-muted" title={p.withdrawn_reason ?? undefined}>
                          nedostavila se
                        </span>
                      ) : null}
                    </td>
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
                        {canWithdraw && !p.withdrawn ? (
                          <Button variant="ghost" size="icon" onClick={() => onWithdraw(p)} aria-label="Stáhnout ze závodu" title="Stáhnout ze závodu (nedostavila se)">
                            <UserX className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canWithdraw && p.withdrawn ? (
                          <Button variant="ghost" size="icon" onClick={() => onRestore(p)} aria-label="Vrátit do závodu" title="Vrátit do závodu">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canAdd ? (
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
          structureLocked={structureLocked}
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
  structureLocked = false,
  nextStartNumber,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  raceId: string;
  categories: { id: string; name: string }[];
  patrol: Patrol | null;
  /** Stav ready: start. číslo a kategorie jsou zamčené (vytištěné karty, pořadí). */
  structureLocked?: boolean;
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
            <Select value={category || undefined} onValueChange={setCategory} disabled={structureLocked}>
              <SelectTrigger className="h-10 rounded-10 border-1.5 border-scout-border bg-white text-14 text-scout-text shadow-sm">
                <SelectValue placeholder="Vyber kategorii" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {structureLocked ? (
              <p className="text-xs text-muted-foreground">
                Kategorie a startovní číslo jsou po přípravě závodu zamčené — mění zařazení
                ve výsledcích a číslo je na vytištěných kartách.
              </p>
            ) : null}
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
