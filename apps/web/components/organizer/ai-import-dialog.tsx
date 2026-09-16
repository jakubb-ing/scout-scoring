"use client";

import * as React from "react";
import { Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PointStepSelect } from "@/components/organizer/point-step-select";
import { extractStationsFromDocument, refineStations } from "@/lib/api/ai-import";
import {
  toPointStep,
  type AiImportQuestion,
  type AiImportStationDraft,
  type StationCriterion,
} from "@/lib/api/types";
import { useBulkCreateStations } from "@/lib/queries/stations";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.txt,.md,application/pdf,text/plain,text/markdown";

type Step = "upload" | "questions" | "preview";

interface AnswerMap { [questionId: string]: string }

export function AiImportDialog({
  open,
  onOpenChange,
  raceId,
  startPosition,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  raceId: string;
  startPosition: number;
}) {
  const [step, setStep] = React.useState<Step>("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [excerpt, setExcerpt] = React.useState<string>("");
  const [draft, setDraft] = React.useState<AiImportStationDraft[]>([]);
  const [questions, setQuestions] = React.useState<AiImportQuestion[]>([]);
  const [answers, setAnswers] = React.useState<AnswerMap>({});
  const [stations, setStations] = React.useState<AiImportStationDraft[]>([]);

  const bulkCreate = useBulkCreateStations(raceId);

  // Reset state every time we open the dialog so re-running starts fresh.
  React.useEffect(() => {
    if (!open) return;
    setStep("upload");
    setFile(null);
    setBusy(false);
    setExcerpt("");
    setDraft([]);
    setQuestions([]);
    setAnswers({});
    setStations([]);
  }, [open]);

  function pickFile(f: File | null) {
    if (!f) return setFile(null);
    if (f.size > MAX_BYTES) {
      toast.error("Soubor je větší než 5 MB.");
      return;
    }
    setFile(f);
  }

  async function onExtract() {
    if (!file) return;
    setBusy(true);
    try {
      const res = await extractStationsFromDocument(raceId, file);
      setExcerpt(res.document_excerpt);
      setDraft(res.draft_stations);
      setQuestions(res.questions ?? []);
      if ((res.questions ?? []).length === 0) {
        // Nothing to clarify — go straight to preview with the draft.
        setStations(res.draft_stations);
        setStep("preview");
      } else {
        setAnswers(Object.fromEntries(res.questions.map((q) => [q.id, ""])));
        setStep("questions");
      }
    } catch (e) {
      toast.error(humanizeError(e, "Extrakce dokumentu selhala."));
    } finally {
      setBusy(false);
    }
  }

  async function onRefine() {
    setBusy(true);
    try {
      const payload = {
        document_excerpt: excerpt,
        draft_stations: draft,
        answers: questions.map((q) => ({ id: q.id, answer: answers[q.id] ?? "" })),
      };
      const res = await refineStations(raceId, payload);
      setStations(res.stations);
      setStep("preview");
    } catch (e) {
      toast.error(humanizeError(e, "Zpřesnění selhalo."));
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (stations.length === 0) {
      toast.error("Žádná stanoviště k uložení.");
      return;
    }
    // Renumber positions starting from `startPosition` so newly imported
    // stations don't collide with anything the organizer already created.
    const renumbered = stations.map((s, i) => ({ ...s, position: startPosition + i }));
    try {
      const res = await bulkCreate.mutateAsync(renumbered);
      toast.success(`Vytvořeno ${res.created} stanovišť.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(humanizeError(e, "Uložení selhalo."));
    }
  }

  function updateStation(i: number, patch: Partial<AiImportStationDraft>) {
    setStations((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function updateCriterion(si: number, ci: number, patch: Partial<StationCriterion>) {
    setStations((arr) =>
      arr.map((s, idx) =>
        idx === si
          ? { ...s, criteria: s.criteria.map((c, cidx) => (cidx === ci ? { ...c, ...patch } : c)) }
          : s,
      ),
    );
  }
  function addCriterion(si: number) {
    setStations((arr) =>
      arr.map((s, idx) =>
        idx === si ? { ...s, criteria: [...s.criteria, { name: "", max_points: 5 }] } : s,
      ),
    );
  }
  function removeCriterion(si: number, ci: number) {
    setStations((arr) =>
      arr.map((s, idx) =>
        idx === si ? { ...s, criteria: s.criteria.filter((_, cidx) => cidx !== ci) } : s,
      ),
    );
  }
  function removeStation(si: number) {
    setStations((arr) => arr.filter((_, idx) => idx !== si));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> AI import stanovišť
          </DialogTitle>
          <DialogDescription>
            Nahraj PDF nebo textový dokument s rozpisem závodu. AI vytvoří draft stanovišť, případně se doptá na nejasnosti.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                PDF, TXT nebo MD, max 5 MB. Bez obrázků a grafiky.
              </p>
              <Input
                type="file"
                accept={ACCEPT}
                className="mx-auto mt-3 max-w-xs cursor-pointer"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <p className="mt-3 text-sm">
                  Vybráno: <span className="font-medium">{file.name}</span>{" "}
                  <span className="text-muted-foreground">({Math.round(file.size / 1024)} kB)</span>
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Zrušit
              </Button>
              <Button onClick={onExtract} disabled={!file || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Analyzovat
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "questions" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              AI potřebuje upřesnit pár věcí, než stanoviště dokončí. Odpověz prosím co nejstručněji.
            </p>
            <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
              {questions.map((q) => (
                <div key={q.id} className="space-y-1">
                  <Label htmlFor={`q-${q.id}`}>{q.question}</Label>
                  {q.context ? (
                    <p className="text-xs text-muted-foreground">{q.context}</p>
                  ) : null}
                  <Input
                    id={`q-${q.id}`}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((m) => ({ ...m, [q.id]: e.target.value }))}
                    placeholder="Odpověď…"
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")} disabled={busy}>
                Zpět
              </Button>
              <Button onClick={onRefine} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Vytvořit stanoviště
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Náhled stanovišť před uložením. Můžeš ještě upravit nebo některé odebrat.
            </p>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {stations.length === 0 ? (
                <p className="text-sm">AI nevrátila žádná stanoviště.</p>
              ) : (
                stations.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-start gap-2">
                      <Input
                        value={s.name}
                        onChange={(e) => updateStation(i, { name: e.target.value })}
                        placeholder="Název stanoviště"
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeStation(i)} aria-label="Odebrat">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                      <Label htmlFor={`ai-point-step-${i}`} className="text-sm">
                        Krok bodování
                      </Label>
                      <PointStepSelect
                        id={`ai-point-step-${i}`}
                        value={toPointStep(s.point_step)}
                        onChange={(step) => updateStation(i, { point_step: step })}
                      />
                    </div>
                    <div className="mt-3 space-y-2">
                      {s.criteria.map((c, ci) => (
                        <div key={ci} className="grid grid-cols-[1fr,100px,36px] gap-2">
                          <Input
                            value={c.name}
                            onChange={(e) => updateCriterion(i, ci, { name: e.target.value })}
                            placeholder="Kritérium"
                          />
                          <Input
                            type="number"
                            min={0}
                            step={toPointStep(s.point_step)}
                            value={c.max_points}
                            onChange={(e) => updateCriterion(i, ci, { max_points: Number(e.target.value) })}
                            aria-label="Max bodů"
                          />
                          <Button variant="ghost" size="icon" onClick={() => removeCriterion(i, ci)} aria-label="Odebrat">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="ghost" size="sm" onClick={() => addCriterion(i)}>
                        <Plus className="h-4 w-4" /> Přidat kritérium
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulkCreate.isPending}>
                Zrušit
              </Button>
              <Button onClick={onCommit} disabled={bulkCreate.isPending || stations.length === 0}>
                {bulkCreate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Uložit {stations.length} stanovišť
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function humanizeError(err: unknown, fallback: string): string {
  // ApiError instances expose .body which may carry a structured detail.
  if (err && typeof err === "object" && "status" in err) {
    const e = err as { status: number; body?: unknown };
    const body = e.body as { error?: string; detail?: string } | undefined;
    if (e.status === 413) return "Soubor je větší než 5 MB.";
    if (e.status === 415) return "Tento formát souboru není podporovaný.";
    if (body?.error === "ai_invalid_format") return "AI vrátila neplatný formát i po retry.";
    if (body?.detail) return body.detail;
  }
  return fallback;
}
