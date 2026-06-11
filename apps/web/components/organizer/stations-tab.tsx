"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { ChevronDown, KeyRound, Pencil, Plus, Power, QrCode, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { useRace, useReissueStationTokens } from "@/lib/queries/races";
import {
  useStations,
  useCreateStation,
  useUpdateStation,
  useDeactivateStation,
  useResetStationPin,
} from "@/lib/queries/stations";
import type { Station, StationCriterion } from "@/lib/api/types";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AiImportDialog } from "./ai-import-dialog";

function pluralizeCriteria(n: number): string {
  if (n === 1) return "kritérium";
  if (n >= 2 && n <= 4) return "kritéria";
  return "kritérií";
}

export function StationsTab({ raceId }: { raceId: string }) {
  const { data: race } = useRace(raceId);
  const { data: stationsData, isLoading: stationsLoading } = useStations(raceId);
  const deactivate = useDeactivateStation(raceId);
  const resetPin = useResetStationPin(raceId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);

  const stations = stationsData ?? [];
  const canModify = race?.state === "draft" && race.access_role !== "read";
  const canEdit = race?.access_role !== "read";
  const canEditDefinition = canModify;

  async function onToggleActive(s: Station) {
    const message = s.is_active
      ? `Deaktivovat stanoviště ${s.name}? Rozhodčí se už nedostanou dál.`
      : `Aktivovat stanoviště ${s.name}? Rozhodčí se budou moci znovu přihlásit.`;
    if (!confirm(message)) return;

    try {
      await deactivate.mutateAsync(s.id);
      toast.success(s.is_active ? "Deaktivováno." : "Aktivováno.");
    } catch {
      toast.error(s.is_active ? "Nepodařilo se deaktivovat." : "Nepodařilo se aktivovat.");
    }
  }

  async function onResetPin(s: Station) {
    if (!confirm(`Restartovat PIN pro stanoviště ${s.name}? Původní QR a už přihlášená zařízení ztratí přístup.`)) {
      return;
    }

    try {
      await resetPin.mutateAsync(s.id);
      toast.success("PIN restartován. Vytiskni novou Login Card.");
    } catch {
      toast.error("Restart PINu selhal.");
    }
  }

  if (!race) return null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-18 font-bold text-scout-text">Stanoviště</h2>
          <p className="text-12 text-scout-text">Kritéria bodování konfiguruješ per stanoviště.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCardsOpen(true)} disabled={stations.length === 0}>
            <QrCode className="h-4 w-4" />
            Login Cards
          </Button>
          {canModify ? (
            <>
              <Button variant="outline" onClick={() => setAiImportOpen(true)}>
                <Sparkles className="h-4 w-4" />
                AI import
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Nové stanoviště
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {stationsLoading ? (
        <div className="rounded-12 border border-scout-border bg-white p-8 text-center text-13 text-scout-text-muted">Načítám…</div>
      ) : stations.length === 0 ? (
        <EmptyState
          title="Žádná stanoviště"
          description={
            canModify
              ? "Založ stanoviště s kritérii bodování. Spustit závod půjde, až bude aspoň jedno."
              : `Závod je ${race.state === "active" ? "spuštěný" : "uzavřený"} — nová stanoviště už nejdou přidat.`
          }
          action={
            canModify ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" /> První stanoviště
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stations.map((s) => {
            const totalPoints = (s.criteria ?? []).reduce((sum, c) => sum + (c.max_points || 0), 0);
            const criteriaCount = s.criteria?.length ?? 0;
            return (
              <div key={s.id} className="rounded-12 border border-scout-border bg-white p-4.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-0.6 text-scout-text-muted">
                      #{s.position}
                      {s.is_active ? <Badge variant="default">Aktivní</Badge> : <Badge variant="muted">Neaktivní</Badge>}
                      {s.allow_half_points ? <Badge variant="secondary">0,5 b.</Badge> : null}
                    </div>
                    <div className="mt-1 truncate text-16 font-bold text-scout-text">{s.name}</div>
                    <div className="mt-1 text-12 text-scout-text-muted">
                      Max <span className="font-bold tabular-nums text-scout-text">{totalPoints}</span> b.
                      <span className="mx-2 text-scout-border">·</span>
                      {criteriaCount} {pluralizeCriteria(criteriaCount)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {canEdit ? (
                      <>
                        {canEditDefinition ? (
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setDialogOpen(true); }} aria-label="Upravit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onResetPin(s)}
                          disabled={resetPin.isPending || race.state !== "active"}
                          aria-label="Restartovat PIN"
                          title="Restartovat PIN"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onToggleActive(s)}
                          aria-label={s.is_active ? "Deaktivovat" : "Aktivovat"}
                          title={s.is_active ? "Deaktivovat" : "Aktivovat"}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                {criteriaCount > 0 ? (
                  <details className="group mt-4 border-t border-scout-border pt-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-13 text-scout-text-muted hover:text-scout-text">
                      <span>Podúkoly</span>
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-3 space-y-1">
                      {s.criteria!.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-13 text-scout-text border-b border-dashed border-scout-border pb-[1px]">
                          <span>{c.name}</span>
                          <span className="tabular-nums text-scout-text-muted text-center min-w-[40px]">{c.max_points} b.</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <div className="mt-4 border-t border-scout-border pt-3 text-13 text-scout-text-muted">Žádná kritéria</div>
                )}

                <div className="mt-4 flex items-center gap-2 text-12 text-scout-text-muted">
                  {s.pin ? (
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="h-3.5 w-3.5" />
                      PIN: <code className="font-mono text-scout-text">{s.pin}</code>
                    </span>
                  ) : (
                    <span className="italic">Login Cards ještě nevygenerovány</span>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {canEditDefinition ? (
        <StationDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          raceId={raceId}
          station={editing}
          nextPosition={stations.length ? Math.max(...stations.map((s) => s.position)) + 1 : 1}
          onSaved={() => setDialogOpen(false)}
        />
      ) : null}

      <LoginCardsDialog
        open={cardsOpen}
        onOpenChange={setCardsOpen}
        stations={stations}
        raceId={raceId}
        raceName={race.name}
        raceState={race.state}
        canReissue={canEdit}
      />

      {canModify ? (
        <AiImportDialog
          open={aiImportOpen}
          onOpenChange={setAiImportOpen}
          raceId={raceId}
          startPosition={stations.length ? Math.max(...stations.map((s) => s.position)) + 1 : 1}
        />
      ) : null}
    </div>
  );
}

function StationDialog({
  open,
  onOpenChange,
  raceId,
  station,
  nextPosition,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  raceId: string;
  station: Station | null;
  nextPosition: number;
  onSaved: () => void;
}) {
  const createStation = useCreateStation(raceId);
  const updateStation = useUpdateStation(raceId);
  const [name, setName] = useState("");
  const [allowHalfPoints, setAllowHalfPoints] = useState(false);
  const [criteria, setCriteria] = useState<StationCriterion[]>([{ name: "", max_points: 10 }]);

  useEffect(() => {
    if (open) {
      setName(station?.name ?? "");
      setAllowHalfPoints(station?.allow_half_points === true);
      setCriteria(station?.criteria?.length ? station.criteria : [{ name: "", max_points: 10 }]);
    }
  }, [open, station]);

  const submitting = createStation.isPending || updateStation.isPending;

  function updateCriterion(i: number, patch: Partial<StationCriterion>) {
    setCriteria((arr) => arr.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addCriterion() { setCriteria((arr) => [...arr, { name: "", max_points: 5 }]); }
  function removeCriterion(i: number) { setCriteria((arr) => arr.filter((_, idx) => idx !== i)); }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = criteria
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({ name: c.name.trim(), max_points: Number(c.max_points) || 0 }));
    if (cleaned.length === 0) {
      toast.error("Přidej alespoň jedno kritérium.");
      return;
    }
    try {
      const payload = {
        name,
        position: station ? station.position : nextPosition,
        allow_half_points: allowHalfPoints,
        criteria: cleaned,
      };
      if (station) await updateStation.mutateAsync({ id: station.id, data: payload });
      else await createStation.mutateAsync(payload);
      toast.success(station ? "Uloženo." : "Stanoviště vytvořeno.");
      onSaved();
    } catch {
      toast.error("Uložení selhalo.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-xl grid-rows-none flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{station ? "Upravit stanoviště" : "Nové stanoviště"}</DialogTitle>
          <DialogDescription>Kritéria se na stanovišti zobrazí rozhodčímu jako formulář.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
          <div className="-mx-1 max-h-[calc(90vh-180px)] space-y-5 overflow-y-auto overscroll-contain px-1 pr-2">
            <div className="space-y-2">
              <Label htmlFor="sname">
                Název
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Pořadí #{station ? station.position : nextPosition}
                </span>
              </Label>
              <Input id="sname" required value={name} onChange={(e) => setName(e.target.value)} placeholder="První pomoc" />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-scout-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="allow-half-points">Povolit půlbody</Label>
                <p className="text-12 text-scout-text-muted">Rozhodčí může zadávat body po 0,5.</p>
              </div>
              <Switch
                id="allow-half-points"
                checked={allowHalfPoints}
                onCheckedChange={setAllowHalfPoints}
                aria-label="Povolit půlbody"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Kritéria bodování</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addCriterion}>
                  <Plus className="h-4 w-4" /> Přidat
                </Button>
              </div>
              <div className="space-y-2">
                {criteria.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr,100px,36px] gap-2">
                    <Input value={c.name} onChange={(e) => updateCriterion(i, { name: e.target.value })} placeholder="Resuscitace" />
                    <Input
                      type="number"
                      min={0}
                      step={allowHalfPoints ? 0.5 : 1}
                      value={c.max_points}
                      onChange={(e) => updateCriterion(i, { max_points: Number(e.target.value) })}
                      aria-label="Max bodů"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeCriterion(i)} aria-label="Odebrat">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-scout-border pt-4">
            <Button type="submit" disabled={submitting}>{station ? "Uložit" : "Vytvořit"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoginCardsDialog({
  open,
  onOpenChange,
  stations,
  raceId,
  raceName,
  raceState,
  canReissue,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stations: Station[];
  raceId: string;
  raceName: string;
  raceState: "draft" | "active" | "closed";
  canReissue: boolean;
}) {
  // QR URLs carry only station id + PIN. The judge-facing page exchanges
  // that short URL for a station token and stores it locally.
  const reissue = useReissueStationTokens(raceId);
  const [issued, setIssued] = useState<Record<string, { pin?: string }>>({});
  const [mounted, setMounted] = useState(false);

  const issue = useCallback(async () => {
    try {
      const payload = await reissue.mutateAsync();
      const byId: Record<string, { pin?: string }> = {};
      for (const s of payload.stations) {
        byId[s.id] = { pin: s.pin };
      }
      setIssued(byId);
    } catch {
      toast.error("Nepodařilo se vygenerovat tokeny.");
    }
  }, [reissue]);

  useEffect(() => {
    setMounted(true);
  }, []);

  function onPrint() {
    window.print();
  }

  const rows = stations.map((s) => {
    const pin = issued[s.id]?.pin ?? s.pin;
    return {
      ...s,
      // URL se skládá vždy z aktuální domény, aby karty fungovaly
      // pro libovolné nasazení FE bez konfigurace.
      qr_url: pin && mounted ? `${window.location.origin}/station/${s.id}?pin=${pin}` : undefined,
      pin,
    };
  });

  const renderLoginCard = (s: Station) => (
    <div key={s.id} className="login-card flex items-center gap-4 rounded-lg border border-border p-4">
      {s.qr_url ? (
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(s.qr_url!);
              toast.success("Odkaz zkopírován.");
            } catch {
              toast.error("Kopírování selhalo.");
            }
          }}
          className="grid h-32 w-32 shrink-0 place-items-center rounded-md border border-border bg-white p-2 transition hover:ring-2 hover:ring-ring print:h-36 print:w-36 print:hover:ring-0"
          aria-label="Zkopírovat odkaz"
          title="Klikni pro zkopírování odkazu"
        >
          <QRCodeSVG value={s.qr_url} size={112} level="M" marginSize={1} className="print:h-32 print:w-32" />
        </button>
      ) : (
        <div className="grid h-32 w-32 shrink-0 place-items-center rounded-md border border-border bg-secondary text-xs text-muted-foreground print:h-36 print:w-36">
          <span>QR</span>
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          #{s.position} · {raceName}
        </div>
        <div className="truncate text-base font-semibold">{s.name}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          PIN: <code className="font-mono text-foreground">{s.pin ?? "—"}</code>
        </div>
        {s.qr_url ? (
          <div className="mt-2 max-w-full break-all font-mono text-[11px] leading-snug text-muted-foreground">
            {s.qr_url}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {mounted
        ? createPortal(
            <div id="login-cards-print" className="hidden">
              {rows.map(renderLoginCard)}
            </div>,
            document.body,
          )
        : null}

      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Login Cards</DialogTitle>
          <DialogDescription>
            Vytiskni a rozdej rozhodčím. Každá karta obsahuje krátký QR odkaz s PINem. Vygenerování znovu změní PINy na kartách.
          </DialogDescription>
        </DialogHeader>

        {raceState === "draft" ? (
          <div className="rounded-md border border-accent/30 bg-accent/10 p-4 text-sm">
            Závod ještě neběží. Po spuštění závodu dostaneš jednorázové tokeny, které jsou teď skryté.
          </div>
        ) : null}
        {!canReissue && raceState !== "draft" ? (
          <div className="rounded-md border border-scout-border bg-scout-bg-subtle p-4 text-sm text-scout-text-muted">
            Máš přístup jen pro čtení. Login Cards můžeš zobrazit a tisknout, ale nové PINy může vygenerovat jen editor závodu.
          </div>
        ) : null}

        <div id="login-cards" className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          {rows.map(renderLoginCard)}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zavřít</Button>
          {canReissue ? (
            <Button variant="outline" onClick={issue} disabled={reissue.isPending || raceState === "draft"}>
              {reissue.isPending ? "Generuji…" : "Vygenerovat znovu"}
            </Button>
          ) : null}
          <Button onClick={onPrint} disabled={raceState === "draft"}>Tisknout</Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}
