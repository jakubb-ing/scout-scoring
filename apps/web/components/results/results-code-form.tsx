"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResultsCodeForm({
  onSubmit,
  error,
  submitting,
}: {
  onSubmit: (code: string) => void | Promise<unknown>;
  error?: string | null;
  submitting?: boolean;
}) {
  const [code, setCode] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    void onSubmit(code.trim());
  }

  return (
    <main className="grid min-h-screen place-items-center bg-scout-bg-app px-6 py-10 text-scout-text">
      <div className="w-full max-w-md rounded-12 border border-scout-border bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2.25 w-2.25 rounded-full bg-scout-yellow" />
          <span className="text-15 font-bold tracking-tightest text-scout-blue">Scout Scoring</span>
        </div>

        <div className="mb-6">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-scout-bg-subtle text-scout-blue">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-22 font-bold tracking-tight">Výsledky závodu</h1>
          <p className="mt-1.5 text-13 text-scout-text-muted">
            Tato výsledková listina je chráněná. Zadej přístupový kód, který ti dal pořadatel.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="results-code">Přístupový kód</Label>
            <Input
              id="results-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Např. JARO2026"
              autoComplete="off"
              autoFocus
              disabled={submitting}
            />
            {error ? <p className="text-13 text-destructive">{error}</p> : null}
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={!code.trim() || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Zobrazit výsledky
          </Button>
        </form>
      </div>
    </main>
  );
}
