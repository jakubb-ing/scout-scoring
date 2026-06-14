"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelp, Copy, Plus, RefreshCw, Share2, Trash2, X } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDeleteRaceMember,
  useRace,
  useRaceMembers,
  useRegeneratePublicCode,
  useShareRace,
  useUpdateRace,
  useUpdateRaceMember,
} from "@/lib/queries/races";
import { usePatrols } from "@/lib/queries/patrols";
import { useCategories, useCreateCategory, useDeleteCategory } from "@/lib/queries/categories";
import { useUsers } from "@/lib/queries/auth";
import { ApiError } from "@/lib/api/client";

const SCORING_OPTIONS = [
  { value: "sum_points", label: "Součet bodů" },
  { value: "sum_ranks", label: "Součet pořadí (v2)" },
  { value: "points_plus_time", label: "Body + čas tiebreaker (v2)" },
] as const;

const TIME_OPTIONS = [
  { value: "none", label: "Neměří se" },
  { value: "per_station", label: "Na každém stanovišti" },
  { value: "start_finish", label: "Jen start / cíl" },
] as const;

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Název je povinný."),
  date: z.string(),
  location: z.string(),
  scoring: z.enum(["sum_points", "sum_ranks", "points_plus_time"]),
  timeMode: z.enum(["none", "per_station", "start_finish"]),
});

const categorySchema = z.object({
  newCategory: z.string().trim().min(1, "Zadej název kategorie."),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;
type CategoryFormValues = z.infer<typeof categorySchema>;
type ScoringValue = SettingsFormValues["scoring"];
type TimeModeValue = SettingsFormValues["timeMode"];

function toDateInputValue(v: string | null | undefined): string {
  if (!v) return "";
  const match = /^\d{4}-\d{2}-\d{2}/.exec(v);
  return match ? match[0] : "";
}

export function SettingsTab({ raceId }: { raceId: string }) {
  const { data: race } = useRace(raceId);
  const { data: categoriesData, isLoading: categoriesLoading } = useCategories(raceId);
  const { data: patrolsData } = usePatrols(raceId);
  const updateRace = useUpdateRace(raceId);
  const createCategory = useCreateCategory(raceId);
  const deleteCategory = useDeleteCategory(raceId);
  const canManageAccess = race?.access_role === "owner" || race?.access_role === "edit";
  const { data: usersData } = useUsers(canManageAccess);
  const { data: membersData } = useRaceMembers(raceId, canManageAccess);
  const shareRace = useShareRace(raceId);
  const updateMember = useUpdateRaceMember(raceId);
  const deleteMember = useDeleteRaceMember(raceId);
  const regeneratePublicCode = useRegeneratePublicCode(raceId);
  const [shareEmail, setShareEmail] = useState("");
  const [shareEmailError, setShareEmailError] = useState<string | null>(null);
  const [shareRole, setShareRole] = useState<"read" | "edit">("read");
  const [resultsOrigin, setResultsOrigin] = useState("");
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  const {
    control,
    formState: settingsFormState,
    handleSubmit: handleSettingsSubmit,
    register: registerSettings,
    reset: resetSettings,
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: "",
      date: "",
      location: "",
      scoring: "sum_points",
      timeMode: "none",
    },
  });
  const {
    formState: categoryFormState,
    handleSubmit: handleCategorySubmit,
    register: registerCategory,
    reset: resetCategory,
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      newCategory: "",
    },
  });

  useEffect(() => {
    if (!race) return;
    resetSettings({
      name: race.name,
      date: toDateInputValue(race.date),
      location: race.location ?? "",
      scoring: toScoringValue(race.scoring_model),
      timeMode: toTimeModeValue(race.time_tracking),
    });
  }, [race, resetSettings]);

  useEffect(() => {
    setResultsOrigin(window.location.origin);
  }, []);

  async function onRegeneratePublicCode() {
    try {
      await regeneratePublicCode.mutateAsync();
      setRegenerateOpen(false);
      toast.success("Nový kód vygenerován. Starý odkaz už neplatí.");
    } catch {
      toast.error("Vygenerování se nepodařilo.");
    }
  }

  async function onCopyResultsLink() {
    if (!resultsOrigin) return;
    const url = `${resultsOrigin}/dashboard/results?raceId=${encodeURIComponent(raceId)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Odkaz zkopírován.");
    } catch {
      toast.error("Odkaz se nepodařilo zkopírovat.");
    }
  }

  async function onSave(values: SettingsFormValues) {
    try {
      await updateRace.mutateAsync({
        name: values.name.trim(),
        date: values.date || null,
        location: values.location.trim() || null,
        scoring_model: values.scoring,
        time_tracking: values.timeMode,
      });
      toast.success("Uloženo.");
    } catch {
      toast.error("Uložení selhalo.");
    }
  }

  async function onAddCategory(values: CategoryFormValues) {
    try {
      await createCategory.mutateAsync({ name: values.newCategory.trim() });
      resetCategory();
      toast.success("Kategorie přidána.");
    } catch {
      toast.error("Nepodařilo se přidat.");
    }
  }

  if (!race) return null;

  const currentRace = race;
  const readOnlyAccess = race.access_role === "read";
  const readOnly = race.state !== "draft" || readOnlyAccess;
  const categories = categoriesData ?? [];
  const patrols = patrolsData ?? [];
  const users = usersData ?? [];
  const members = membersData ?? [];
  const categoryPatrolCounts = patrols.reduce<Record<string, number>>((acc, patrol) => {
    if (patrol.category) {
      acc[patrol.category] = (acc[patrol.category] ?? 0) + 1;
    }
    return acc;
  }, {});

  async function onDeleteCategory(categoryId: string) {
    try {
      await deleteCategory.mutateAsync(categoryId);
      toast.success("Kategorie smazána.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error("Kategorii nelze smazat, protože obsahuje hlídku.");
        return;
      }

      toast.error("Nepodařilo se smazat kategorii.");
    }
  }

  async function onShareRace() {
    const email = shareEmail.trim().toLowerCase();
    setShareEmailError(null);

    if (!email) {
      setShareEmailError("Zadej email organizátora.");
      return;
    }

    const organizer = users.find((u) => u.email.toLowerCase() === email);

    if (!organizer) {
      setShareEmailError("Uživatel s tímto emailem neexistuje.");
      return;
    }

    if (organizer.id === currentRace.owner) {
      setShareEmailError("Tento uživatel je vlastník závodu.");
      return;
    }

    if (members.some((m) => m.organizer_id === organizer.id)) {
      setShareEmailError("Tento uživatel už má k závodu přístup.");
      return;
    }

    try {
      await shareRace.mutateAsync({ organizer_id: organizer.id, role: shareRole });
      setShareEmail("");
      setShareRole("read");
      toast.success("Přístup přidán.");
    } catch {
      toast.error("Přístup se nepodařilo uložit.");
    }
  }

  async function onChangeMemberRole(id: string, role: "read" | "edit") {
    try {
      await updateMember.mutateAsync({ id, role });
      toast.success("Práva upravena.");
    } catch {
      toast.error("Práva se nepodařilo upravit.");
    }
  }

  async function onRemoveMember(id: string) {
    try {
      await deleteMember.mutateAsync(id);
      toast.success("Přístup odebrán.");
    } catch {
      toast.error("Přístup se nepodařilo odebrat.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {readOnly ? (
        <div className="rounded-12 border border-scout-border bg-white p-4 text-13 text-scout-text-muted">
          {readOnlyAccess ? (
            <>Máš přístup jen pro čtení. Editace závodu je uzamčena.</>
          ) : (
            <>Závod je ve stavu <Badge variant="default" className="mx-1">{race.state}</Badge>. Některá pole jsou uzamčena.</>
          )}
        </div>
      ) : null}

      <form onSubmit={handleSettingsSubmit(onSave)} className="space-y-5 rounded-12 border border-scout-border bg-white p-5">
        <div>
          <h2 className="text-16 font-bold text-scout-text">Základní</h2>
          <p className="text-12 text-scout-text-muted">Název, datum, místo konání.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sname">Název</Label>
            <Input id="sname" {...registerSettings("name")} disabled={readOnly} />
            <FieldError message={settingsFormState.errors.name?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sdate">Datum</Label>
            <Input id="sdate" type="date" {...registerSettings("date")} disabled={readOnly} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sloc">Místo</Label>
            <Input id="sloc" {...registerSettings("location")} disabled={readOnly} />
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="text-16 font-bold text-scout-text">Bodování</h2>
          <p className="text-12 text-scout-text-muted">
            V MVP jen součet bodů. Ostatní modely budou v další verzi.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Model</Label>
            <Controller
              control={control}
              name="scoring"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCORING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Měření času</Label>
            <Controller
              control={control}
              name="timeMode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div>
          <Button type="submit" disabled={readOnly || updateRace.isPending}>Uložit nastavení</Button>
        </div>
      </form>

      <Separator />

      {canManageAccess ? (
        <section className="rounded-12 border border-scout-border bg-white p-5">
          <div className="mb-4">
            <h2 className="text-16 font-bold text-scout-text">Sdílení závodu</h2>
            <p className="text-12 text-scout-text-muted">Přidej další organizátory s právy pro čtení nebo editaci.</p>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="share-email">Email organizátora</Label>
              <Input
                id="share-email"
                type="email"
                value={shareEmail}
                onChange={(e) => {
                  setShareEmail(e.target.value);
                  setShareEmailError(null);
                }}
                placeholder="organizator@oddil.cz"
              />
              <FieldError message={shareEmailError ?? undefined} />
            </div>
            <div className="space-y-2">
              <Label>Práva</Label>
              <Select value={shareRole} onValueChange={(value) => setShareRole(value as "read" | "edit")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Čtení</SelectItem>
                  <SelectItem value="edit">Editace</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={onShareRace} disabled={!shareEmail.trim() || shareRace.isPending}>
              <Share2 className="h-4 w-4" /> Sdílet
            </Button>
          </div>

          <div className="divide-y divide-scout-border rounded-8 border border-scout-border">
            {members.length === 0 ? (
              <div className="p-3 text-13 text-scout-text-muted">Závod zatím není sdílený.</div>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-13 font-semibold text-scout-text">{m.name || "Bez jména"}</div>
                    <div className="truncate text-12 text-scout-text-muted">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={m.role} onValueChange={(value) => onChangeMemberRole(m.id, value as "read" | "edit")}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="read">Čtení</SelectItem>
                        <SelectItem value="edit">Editace</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveMember(m.id)} aria-label="Odebrat přístup">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {!readOnlyAccess ? (
        <>
          <Separator />

          <section className="rounded-12 border border-scout-border bg-white p-5">
            <div className="mb-4">
              <h2 className="text-16 font-bold text-scout-text">Veřejné výsledky</h2>
              <p className="text-12 text-scout-text-muted">
                Každý závod má vlastní přístupový kód. Sdílej odkaz a kód a kdokoliv uvidí výsledkovou listinu bez přihlášení.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <Label>Přístupový kód</Label>
                <div className="inline-flex items-center rounded-8 border border-scout-border bg-scout-bg-subtle px-3 py-2 font-mono text-18 font-bold tracking-0.5 text-scout-text">
                  {currentRace.public_code ?? "—"}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRegenerateOpen(true)}
                disabled={regeneratePublicCode.isPending}
              >
                <RefreshCw className="h-4 w-4" /> Přegenerovat kód
              </Button>
            </div>

            {currentRace.public_code ? (
              <div className="mt-4 flex flex-col gap-2 rounded-8 border border-scout-border bg-scout-bg-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-12 text-scout-text-muted">Odkaz na veřejné výsledky</div>
                  <div className="truncate text-13 font-medium text-scout-text">
                    {resultsOrigin ? `${resultsOrigin}/dashboard/results?raceId=${raceId}` : "…"}
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onCopyResultsLink}>
                  <Copy className="h-4 w-4" /> Kopírovat odkaz
                </Button>
              </div>
            ) : null}
          </section>

          <Dialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Přegenerovat přístupový kód?</DialogTitle>
                <DialogDescription>
                  Vytvoří se nový kód a ten současný (<span className="font-mono font-semibold">{currentRace.public_code}</span>) přestane platit. Kdokoliv, komu jsi sdílel starý kód, ztratí přístup k výsledkům.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRegenerateOpen(false)}
                  disabled={regeneratePublicCode.isPending}
                >
                  Zrušit
                </Button>
                <Button type="button" onClick={onRegeneratePublicCode} disabled={regeneratePublicCode.isPending}>
                  <RefreshCw className="h-4 w-4" /> Přegenerovat
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      <Separator />

      <section className="rounded-12 border border-scout-border bg-white p-5">
        <div className="mb-4">
          <h2 className="text-16 font-bold text-scout-text">Kategorie</h2>
          <p className="text-12 text-scout-text-muted">Každá má vlastní výsledkovku (dívčí / chlapecké / nesoutěžní).</p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {categoriesLoading ? (
            <span className="text-sm text-muted-foreground">Načítám...</span>
          ) : categories.length === 0 ? (
            <span className="text-sm text-muted-foreground">Zatím žádné kategorie.</span>
          ) : (
            categories.map((c) => (
              <div
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full border border-transparent bg-secondary px-2.5 py-0.5 text-sm font-normal text-secondary-foreground"
              >
                <span>{c.name}</span>
                {categoryPatrolCounts[c.id] ? (
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground"
                    title="Kategorii nelze smazat, protože obsahuje alespoň jednu hlídku."
                    aria-label={`Kategorii ${c.name} nelze smazat, protože obsahuje hlídku`}
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDeleteCategory(c.id)}
                    disabled={readOnly || deleteCategory.isPending}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    title="Smazat kategorii"
                    aria-label={`Smazat kategorii ${c.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleCategorySubmit(onAddCategory)} className="flex max-w-md items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="newcat">Nová kategorie</Label>
            <Input
              id="newcat"
              {...registerCategory("newCategory")}
              placeholder="Dívčí"
              disabled={readOnly}
            />
            <FieldError message={categoryFormState.errors.newCategory?.message} />
          </div>
          <Button type="submit" variant="outline" disabled={readOnly || createCategory.isPending}>
            <Plus className="h-4 w-4" /> Přidat
          </Button>
        </form>
      </section>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-destructive">{message}</p>;
}

function toScoringValue(value: string | null | undefined): ScoringValue {
  if (value === "sum_ranks" || value === "points_plus_time") {
    return value;
  }

  return "sum_points";
}

function toTimeModeValue(value: string | null | undefined): TimeModeValue {
  if (value === "per_station" || value === "start_finish") {
    return value;
  }

  return "none";
}
