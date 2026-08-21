"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RaceState } from "@/lib/api/types";

const STEPS: { state: RaceState; label: string }[] = [
  { state: "draft", label: "Příprava" },
  { state: "ready", label: "Připraveno" },
  { state: "active", label: "Běží" },
  { state: "closed", label: "Uzavřeno" },
];

/**
 * Stavová osa závodu. Bez ní působí tlačítko „Spustit závod" jako
 * osamocená akce — organizátor nevidí, kde v procesu je a co bude dál.
 */
export function RaceStateFlow({ state, className }: { state: RaceState; className?: string }) {
  const currentIndex = STEPS.findIndex((s) => s.state === state);

  return (
    <ol className={cn("flex items-center gap-1.5", className)} aria-label="Stav závodu">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;

        return (
          <li key={step.state} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-11 font-semibold uppercase tracking-0.5 transition",
                current && "bg-white text-scout-blue",
                done && "bg-white/15 text-white/70",
                !done && !current && "text-white/40"
              )}
              aria-current={current ? "step" : undefined}
            >
              {done ? <Check className="h-3 w-3" /> : null}
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <span className={cn("h-px w-4", done ? "bg-white/40" : "bg-white/15")} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Krátká věta o důsledku další akce — proč je tlačítko zrovna teď dostupné. */
export function raceStateHint(state: RaceState): string {
  switch (state) {
    case "draft":
      return "Přidej hlídky a stanoviště. Přípravou se vydají PINy a QR kódy k tisku.";
    case "ready":
      return "QR kódy jsou vydané a jdou tisknout. Spuštěním se otevře zápis bodů na stanovištích.";
    case "active":
      return "Rozhodčí zapisují body. Uzavřením se zápis zastaví — je to nevratné.";
    case "closed":
      return "Závod je uzavřený. Body jdou upravit už jen přes záložku Opravy, vždy s důvodem.";
    default:
      return "";
  }
}
