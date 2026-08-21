"use client";

import { Label } from "@/components/ui/label";
import { NumberStepperInput } from "@/components/ui/number-stepper-input";
import type { StationCriterion } from "@/lib/api/types";

/**
 * Vstupy bodů per kritérium. Sdílené mezi zápisem na stanovišti
 * (ScoreForm) a dodatečnou opravou v dashboardu (corrections-tab).
 */
export function CriteriaInputs({
  criteria,
  values,
  allowHalfPoints,
  errors,
  onChange,
}: {
  criteria: StationCriterion[];
  /** Hodnoty podle criterionFieldKey(criterion, index). */
  values: Record<string, string>;
  allowHalfPoints: boolean;
  errors?: Record<string, string | undefined>;
  onChange: (fieldKey: string, value: number) => void;
}) {
  return (
    <div className="space-y-3">
      {criteria.map((criterion, index) => {
        const fieldKey = criterionFieldKey(criterion, index);
        const max = Math.max(0, Number(criterion.max_points) || 0);
        const current = clamp(Number(values[fieldKey]) || 0, 0, max);
        const error = errors?.[fieldKey];

        return (
          <div
            key={fieldKey}
            className={`rounded-12 border bg-white p-4 ${error ? "border-destructive" : "border-scout-border"}`}
          >
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <Label htmlFor={`crit-${fieldKey}`} className="text-16 font-semibold text-scout-text">
                {criterion.name}
              </Label>
              <span className="shrink-0 text-12 text-scout-text-muted">max {max} b.</span>
            </div>

            <NumberStepperInput
              id={`crit-${fieldKey}`}
              max={max}
              halfStep={allowHalfPoints}
              value={current}
              onChange={(event) => onChange(fieldKey, Number(event.target.value))}
              aria-label={criterion.name}
              aria-valuetext={`${current} z ${max} bodů`}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function criterionFieldKey(criterion: StationCriterion, index: number) {
  return criterion.id != null ? String(criterion.id) : `idx-${index}`;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
