"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsOffline } from "@/lib/offline/online";

/**
 * Obrazovka „závod ještě nebyl spuštěn" — QR je správný, jen se čeká na
 * organizátora. Pooluje (30 s + visibilitychange), po spuštění se rodič
 * přepne sám bez refreshe. Žádný odpočet — závod nemá pevný čas startu.
 */
export function RaceNotStarted({
  raceName,
  stationName,
  entityLabel,
  onRetry,
}: {
  raceName?: string | null;
  stationName?: string | null;
  entityLabel: string;
  onRetry: () => void | Promise<void>;
}) {
  const isOffline = useIsOffline();
  const [lastChecked, setLastChecked] = useState<Date>(() => new Date());
  const [checking, setChecking] = useState(false);
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (cancelled || document.visibilityState === "hidden") return;
      setChecking(true);
      try {
        await retryRef.current();
      } finally {
        if (!cancelled) {
          setChecking(false);
          setLastChecked(new Date());
        }
      }
    }

    const interval = setInterval(() => void check(), 30_000);
    // Telefon v kapse s uspaným tabem — zkontrolovat hned po probuzení.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function onManualRetry() {
    setChecking(true);
    try {
      await retryRef.current();
    } finally {
      setChecking(false);
      setLastChecked(new Date());
    }
  }

  const time = lastChecked.toLocaleTimeString("cs-CZ");

  return (
    <main className="grid min-h-screen place-items-center bg-scout-bg-app px-6 text-center text-scout-text">
      <div className="max-w-md space-y-4">
        <span className="relative mx-auto flex h-12 w-12 items-center justify-center">
          <span className="absolute h-10 w-10 animate-ping rounded-full bg-scout-yellow/40" />
          <Clock className="relative h-7 w-7 text-scout-blue" />
        </span>

        <div>
          {raceName ? <div className="text-13 text-scout-text-muted">{raceName}</div> : null}
          <h1 className="text-20 font-bold">
            {entityLabel}
            {stationName ? `: ${stationName}` : ""}
          </h1>
        </div>

        <p className="text-14 text-scout-text-muted">
          Závod ještě nebyl spuštěn. Jakmile organizátor závod spustí, stránka
          se otevře sama.
        </p>

        {isOffline ? (
          <p className="inline-flex items-center gap-1.5 text-13 text-scout-text-muted">
            <WifiOff className="h-4 w-4" /> Bez připojení — zkontroluj signál.
          </p>
        ) : (
          <p className="text-12 text-scout-text-muted">naposledy ověřeno {time}</p>
        )}

        <Button variant="outline" onClick={onManualRetry} disabled={checking}>
          {checking ? "Ověřuji…" : "Zkusit hned"}
        </Button>
      </div>
    </main>
  );
}
