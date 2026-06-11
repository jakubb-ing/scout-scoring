"use client";

import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, /* Clock, */ Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberStepperInput } from "@/components/ui/number-stepper-input";
import { Switch } from "@/components/ui/switch";
import { useUpsertScoreEntry } from "@/lib/queries/station";
import type { Patrol, ScoreEntry, StationCriterion } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";

interface Props {
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

export function ScoreForm({ patrol, criteria, allowHalfPoints = false, existing, onSaved, onCancel }: Props) {
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
  const submitting = upsert.isPending;

  const total = useMemo(
    () => criteria.reduce((sum, c, index) => sum + (Number(watchedPoints?.[criterionFieldKey(c, index)]) || 0), 0),
    [criteria, watchedPoints]
  );
  const maxTotal = useMemo(
    () => criteria.reduce((sum, c) => sum + (c.max_points || 0), 0),
    [criteria]
  );

  async function onSubmit(values: ScoreFormValues) {
    try {
      const scoresPayload = criteria.map((c, index) => ({
        criterion: c.name,
        points: clamp(normalizePointsValue(values.points[criterionFieldKey(c, index)], allowHalfPoints), 0, c.max_points),
      }));

      const today = new Date().toISOString().slice(0, 10);
      await upsert.mutateAsync({
        patrol_id: patrol.id,
        scores: scoresPayload,
        arrived_at: values.withTime && values.arrivedAt ? `${today}T${values.arrivedAt}:00` : null,
        departed_at: values.withTime && values.departedAt ? `${today}T${values.departedAt}:00` : null,
      });
      toast.success(`Uloženo - ${patrol.name} (${total} b.)`);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        toast.error("Závod je uzavřen. Nelze upravovat.");
      } else {
        toast.error("Uložení selhalo. Zkontroluj signál a zkus znovu.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="-mx-3.5 sm:mx-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-3.5 sm:px-0">
        <div>
          <div className="text-12 text-scout-text-muted">
            <span className="font-mono">#{patrol.start_number}</span> · {patrol.category_name ?? formatCategory(patrol.category)}
          </div>
          <div className="text-21 font-bold text-scout-text">{patrol.name}</div>
        </div>
        {existing ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-scout-yellow-border bg-scout-yellow-soft px-3 py-1 text-11 text-scout-text">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent-foreground" />
            <span>Přepisuješ existující zápis</span>
          </div>
        ) : null}
      </div>

      <div className="px-3.5 sm:px-0">
        <div className="space-y-3">
          {criteria.map((criterion, index) => {
            const fieldKey = criterionFieldKey(criterion, index);
            return (
              <CriterionRow
                key={fieldKey}
                inputId={`crit-${fieldKey}`}
                criterion={criterion}
                allowHalfPoints={allowHalfPoints}
                value={watchedPoints?.[fieldKey] ?? "0"}
                onChange={(value) =>
                  setValue(`points.${fieldKey}`, String(value), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                error={formState.errors.points?.[fieldKey]?.message}
              />
            );
          })}
        </div>
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

      <div className="mx-3.5 mt-4 flex items-center gap-3 border-t-1.5 border-scout-border bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mx-0">
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
    </form>
  );
}

function CriterionRow({
  inputId,
  criterion,
  allowHalfPoints,
  value,
  onChange,
  error,
}: {
  inputId: string;
  criterion: StationCriterion;
  allowHalfPoints: boolean;
  value: string;
  onChange: (value: number) => void;
  error?: string;
}) {
  const max = Math.max(0, Number(criterion.max_points) || 0);
  const current = clamp(Number(value) || 0, 0, max);

  return (
    <div className={`mb-3 rounded-12 border bg-white p-4 ${error ? "border-destructive" : "border-scout-border"}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Label htmlFor={inputId} className="text-16 font-semibold text-scout-text">
          {criterion.name}
        </Label>
        <span className="shrink-0 text-12 text-scout-text-muted">max {max} b.</span>
      </div>

      <NumberStepperInput
        id={inputId}
        max={max}
        halfStep={allowHalfPoints}
        value={current}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={criterion.name}
        aria-valuetext={`${current} z ${max} bodů`}
      />
      <FieldError message={error} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-destructive">{message}</p>;
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

function criterionFieldKey(criterion: StationCriterion, index: number) {
  return criterion.id != null ? String(criterion.id) : `idx-${index}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
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
