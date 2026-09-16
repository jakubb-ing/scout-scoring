"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POINT_STEPS, toPointStep, type PointStep } from "@/lib/api/types";

const LABELS: Record<PointStep, string> = {
  1: "Celé body (1)",
  0.5: "Půlbody (0,5)",
  0.25: "Čtvrtbody (0,25)",
};

/** Výběr kroku bodování stanoviště. Sdílený mezi editací stanoviště a AI importem. */
export function PointStepSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: PointStep;
  onChange: (step: PointStep) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(toPointStep(v))} disabled={disabled}>
      <SelectTrigger id={id} className="w-44" aria-label="Krok bodování">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {POINT_STEPS.map((step) => (
          <SelectItem key={step} value={String(step)}>
            {LABELS[step]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Krátký štítek pro přehled, např. "0,5 b."; pro celé body nic. */
export function pointStepBadgeLabel(step: PointStep | undefined) {
  const s = toPointStep(step);
  return s === 1 ? null : `${String(s).replace(".", ",")} b.`;
}
