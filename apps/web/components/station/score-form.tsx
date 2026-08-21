"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ChevronDown, /* Clock, */ Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { CategoryBadge } from "@/components/category-badge";
import { cn } from "@/lib/utils";
import { useIsOffline } from "@/lib/offline/online";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CriteriaInputs, clamp, criterionFieldKey } from "@/components/station/criteria-inputs";
import { Switch } from "@/components/ui/switch";
import { useUpsertScoreEntry } from "@/lib/queries/station";
import type { Patrol, ScoreEntry, StationCriterion } from "@/lib/api/types";

interface Props {
  stationId: string;
  stationName?: string;
  patrol: Patrol;
  criteria: StationCriterion[];
  allowHalfPoints?: boolean;
  existing: ScoreEntry | null;
  onSaved: () => void;
  onCancel: () => void;
}

type ScoreFormValues = {
  points: Record<string, string>;
  withTime: boolean;
  arrivedAt: string;
  departedAt: string;
};

const timeFieldSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Zadej čas ve formátu HH:MM.")
  .or(z.literal(""));

function createScoreFormSchema(criteria: StationCriterion[], allowHalfPoints: boolean) {
  return z
    .object({
      points: z.record(z.string()),
      withTime: z.boolean(),
      arrivedAt: timeFieldSchema,
      departedAt: timeFieldSchema,
    })
    .superRefine((values, ctx) => {
      for (const [index, criterion] of criteria.entries()) {
        const fieldKey = criterionFieldKey(criterion, index);
        const raw = values.points[fieldKey] ?? "";
        if (raw === "") {
          continue;
        }

        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["points", fieldKey],
            message: "Zadej číslo.",
          });
          continue;
        }

        if (parsed < 0 || parsed > criterion.max_points) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["points", fieldKey],
            message: `Zadej hodnotu 0 až ${criterion.max_points}.`,
          });
          continue;
        }

        if (!hasValidIncrement(parsed, allowHalfPoints)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["points", fieldKey],
            message: allowHalfPoints ? "Zadej celé číslo nebo půl bodu." : "Zadej celé body.",
          });
        }
      }
    });
}

export function ScoreForm({
  stationId,
  stationName,
  patrol,
  criteria,
  allowHalfPoints = false,
  existing,
  onSaved,
  onCancel,
}: Props) {
  const upsert = useUpsertScoreEntry();
  const schema = useMemo(() => createScoreFormSchema(criteria, allowHalfPoints), [allowHalfPoints, criteria]);
  const {
    formState,
    handleSubmit,
    control,
    register,
    reset,
    setValue,
    watch,
  } = useForm<ScoreFormValues>({
    resolver: zodResolver(schema),
    defaultValues: createDefaultValues(criteria, existing),
  });

  useEffect(() => {
    reset(createDefaultValues(criteria, existing));
  }, [criteria, existing, reset]);

  // Dočasně skryto spolu s blokem „Zaznamenat čas" níže.
  // const withTime = watch("withTime");
  const watchedPoints = useWatch({ control, name: "points" });
  const [submitting, setSubmitting] = useState(false);
  const isOffline = useIsOffline();

  // Konec seznamu kritérií — dokud není v dohledu, obsah pokračuje pod
  // spodní lištou a rozhodčí o něm nemusí vědět.
  const endSentinelRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  useEffect(() => {
    const sentinel = endSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setHasMoreBelow(!entry.isIntersecting),
      // Lišta zabírá spodek obrazovky, takže konec musí být nad ní.
      { rootMargin: "0px 0px -96px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [criteria]);

  const total = useMemo(
    () => criteria.reduce((sum, c, index) => sum + (Number(watchedPoints?.[criterionFieldKey(c, index)]) || 0), 0),
    [criteria, watchedPoints]
  );
  const maxTotal = useMemo(
    () => criteria.reduce((sum, c) => sum + (c.max_points || 0), 0),
    [criteria]
  );

  async function onSubmit(values: ScoreFormValues) {
    setSubmitting(true);
    try {
      const scoresPayload = criteria.map((c, index) => ({
        criterion: c.name,
        points: clamp(normalizePointsValue(values.points[criterionFieldKey(c, index)], allowHalfPoints), 0, c.max_points),
      }));

      // Zápis jde do outboxu — resolvne hned, síť řeší flusher na pozadí.
      // Pro rozhodčího není rozdíl mezi „uloženo" a „uloženo lokálně".
      const today = new Date().toISOString().slice(0, 10);
      await upsert.mutateAsync({
        stationId,
        patrol_id: patrol.id,
        scores: scoresPayload,
        arrived_at: values.withTime && values.arrivedAt ? `${today}T${values.arrivedAt}:00` : null,
        departed_at: values.withTime && values.departedAt ? `${today}T${values.departedAt}:00` : null,
      });
      // Zápis jde do fronty; že je v databázi, hlásí až flush
      // (OfflineIndicator). Tvrdit tu víc, než víme, by rozhodčího ukolébalo.
      if (isOffline) {
        toast.success(`Uloženo offline — ${patrol.name}, ${total} b.`, {
          description: "Odešle se automaticky, jakmile bude signál.",
        });
      } else {
        toast.success(`Uloženo — ${patrol.name}, ${total} b.`);
      }
      onSaved();
    } catch {
      toast.error("Uložení selhalo. Zkus to znovu.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="-mx-3.5 sm:mx-0">
      <div className="mb-4 px-3.5 sm:px-0">
        {stationName ? (
          <div className="text-11 uppercase tracking-0.6 text-scout-text-muted">{stationName}</div>
        ) : null}
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-21 font-bold tabular-nums text-scout-blue">#{patrol.start_number}</span>
          <span className="truncate text-21 font-bold text-scout-text">{patrol.name}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <CategoryBadge label={patrol.category_name ?? formatCategory(patrol.category)} />
          {existing ? (
            // Méně výrazné než body — nemá odvádět pozornost od hodnocení.
            <span className="inline-flex items-center gap-1 text-11 text-scout-text-muted">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Upravuješ již uložený zápis
            </span>
          ) : null}
        </div>
      </div>

      <div className="px-3.5 sm:px-0">
        <CriteriaInputs
          criteria={criteria}
          values={watchedPoints ?? {}}
          allowHalfPoints={allowHalfPoints}
          errors={Object.fromEntries(
            criteria.map((c, index) => {
              const key = criterionFieldKey(c, index);
              return [key, formState.errors.points?.[key]?.message];
            })
          )}
          onChange={(fieldKey, value) =>
            setValue(`points.${fieldKey}`, String(value), {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <div ref={endSentinelRef} className="h-px" />
      </div>

      {/* Dočasně skryto — zaznamenávání času příchodu/odchodu.
      <div className="mx-3.5 mt-4 rounded-12 border border-scout-border bg-white p-4 sm:mx-0">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 text-scout-text">
            <Clock className="h-4 w-4" /> Zaznamenat čas
          </Label>
          <Switch checked={withTime} onCheckedChange={(checked) => setValue("withTime", checked)} />
        </div>
        {withTime ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="arrived">Příchod</Label>
              <Input id="arrived" type="time" {...register("arrivedAt")} />
              <FieldError message={formState.errors.arrivedAt?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="departed">Odchod</Label>
              <Input id="departed" type="time" {...register("departedAt")} />
              <FieldError message={formState.errors.departedAt?.message} />
            </div>
          </div>
        ) : null}
      </div>
      */}

      {/* Místo pod poslední kritérium, aby ho fixní lišta nepřekrývala. */}
      <div aria-hidden className="h-[calc(5.5rem+env(safe-area-inset-bottom))]" />

      <div className="fixed inset-x-0 bottom-0 z-20">
        {/* Náznak, že obsah pokračuje pod okrajem. Zmizí, jakmile je konec
            kritérií v dohledu — trvalý signál by při hodnocení rušil. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none h-10 bg-gradient-to-t from-scout-bg-app to-transparent transition-opacity duration-300",
            hasMoreBelow ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="flex h-full items-end justify-center pb-1">
            <ChevronDown className="h-4 w-4 animate-bounce text-scout-text-muted" />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t-1.5 border-scout-border bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
          <div className="min-w-0 flex-1">
            <div className="text-11 text-scout-text-muted">Celkem bodů</div>
            <div className="text-26 font-bold leading-none tabular-nums text-scout-text">
              {total}<span className="text-14 font-normal text-scout-text-muted"> / {maxTotal}</span>
            </div>
          </div>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Zrušit
          </Button>
          <Button type="submit" variant="accent" size="lg" disabled={submitting} className="shrink-0">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Uložit ({total} b.)
          </Button>
        </div>
      </div>
    </form>
  );
}

function createDefaultValues(criteria: StationCriterion[], existing: ScoreEntry | null): ScoreFormValues {
  return {
    points: seedPoints(criteria, existing),
    arrivedAt: existing?.arrived_at?.slice(11, 16) ?? "",
    departedAt: existing?.departed_at?.slice(11, 16) ?? "",
    withTime: Boolean(existing?.arrived_at || existing?.departed_at),
  };
}

function seedPoints(criteria: StationCriterion[], existing: ScoreEntry | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [index, c] of criteria.entries()) {
    const found = existing?.scores?.find((s) => s.criterion === c.name);
    result[criterionFieldKey(c, index)] = found ? String(found.points) : "0";
  }
  return result;
}

function hasValidIncrement(value: number, allowHalfPoints: boolean) {
  const multiplier = allowHalfPoints ? 2 : 1;
  return Number.isInteger(value * multiplier);
}

function normalizePointsValue(value: string | undefined, allowHalfPoints: boolean) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;

  const multiplier = allowHalfPoints ? 2 : 1;
  return Math.round(parsed * multiplier) / multiplier;
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
