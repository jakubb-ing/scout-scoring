"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, LogOut, QrCode, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PatrolPicker } from "@/components/station/patrol-picker";
import { ScoreForm } from "@/components/station/score-form";
import { useStationLogin, useStationMe, useStationEntries } from "@/lib/queries/station";
import { qk } from "@/lib/queries/keys";
import { ApiError, tokens } from "@/lib/api/client";
import type { Patrol } from "@/lib/api/types";
import { useEffect, useState } from "react";

type Mode = "pick" | "score";
type PinExchangeState = "idle" | "pending" | "success" | "error";

export default function StationPage() {
  const params = useParams<{ stationId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();

  const stationId = decodeURIComponent(params.stationId);
  const pinFromUrl = search.get("pin");
  const { mutateAsync: loginStation } = useStationLogin();
  const [loginToken, setLoginToken] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<unknown>(null);
  const [pinExchangeState, setPinExchangeState] = useState<PinExchangeState>("idle");
  const loginAttemptedForPin = React.useRef<string | null>(null);

  // QR URLs carry only station id + PIN. Exchange them once for a station
  // token, then use the stored token for regular station API calls.
  useEffect(() => {
    const loginAttemptKey = pinFromUrl ? `${stationId}:${pinFromUrl}` : null;
    if (!pinFromUrl || !loginAttemptKey || loginToken || loginAttemptedForPin.current === loginAttemptKey) return;

    loginAttemptedForPin.current = loginAttemptKey;
    setLoginError(null);
    setPinExchangeState("pending");

    loginStation({ stationId, pin: pinFromUrl })
      .then((res) => {
        if (loginAttemptedForPin.current !== loginAttemptKey) return;
        tokens.set("station", res.token);
        qc.invalidateQueries({ queryKey: qk.stationMe });
        qc.invalidateQueries({ queryKey: qk.stationEntries });
        setLoginToken(res.token);
        setPinExchangeState("success");
      })
      .catch((err) => {
        if (loginAttemptedForPin.current !== loginAttemptKey) return;
        setLoginError(err);
        setPinExchangeState("error");
      });
  }, [pinFromUrl, loginToken, stationId, loginStation, qc]);

  const hasStoredStationToken = !pinFromUrl && Boolean(tokens.get("station"));
  const hasStationToken = Boolean(loginToken || hasStoredStationToken);
  const exchangingPin = pinExchangeState === "pending";

  const {
    data: stationMeData,
    error: stationMeError,
    isLoading: stationMeLoading,
    isSuccess: stationMeSuccess,
  } = useStationMe(loginToken ?? undefined, hasStationToken && !loginError);
  const { data: stationEntriesData } = useStationEntries(stationMeSuccess);

  const [selected, setSelected] = useState<Patrol | null>(null);
  const [mode, setMode] = useState<Mode>("pick");

  const booting = exchangingPin || (hasStationToken && stationMeLoading);
  const err = loginError ?? stationMeError;
  const errorMsg = err
    ? err instanceof ApiError && err.status === 401
      ? "PIN je neplatný, přístup vypršel nebo je závod uzavřený. Naskenuj QR kód znovu."
      : "Nelze načíst stanoviště. Zkontroluj připojení."
    : !pinFromUrl && !hasStationToken
    ? "Chybí PIN ze QR kódu. Naskenuj kartu stanoviště znovu."
    : null;

  const payload = stationMeData;
  const entries = stationEntriesData ?? [];

  function refresh() {
    qc.invalidateQueries({ queryKey: qk.stationMe });
    qc.invalidateQueries({ queryKey: qk.stationEntries });
  }

  function logoutStation() {
    tokens.clear("station");
    qc.removeQueries({ queryKey: qk.stationMe });
    qc.removeQueries({ queryKey: qk.stationEntries });
    router.replace("/station");
  }

  function onSelect(id: string) {
    const p = payload?.patrols.find((x) => x.id === id) ?? null;
    setSelected(p);
    if (p) setMode("score");
  }

  function onSaved() {
    setSelected(null);
    setMode("pick");
  }

  if (booting) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (errorMsg || !payload) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <EmptyState
          className="max-w-md"
          icon={<QrCode className="h-6 w-6" />}
          title="Přístup se nezdařil"
          description={errorMsg ?? "Neznámá chyba."}
          action={
            <Button onClick={logoutStation}>
              <ArrowLeft className="h-4 w-4" />
              Zpět na přihlášení
            </Button>
          }
        />
      </div>
    );
  }

  const station = payload.station;
  const existingForSelected = selected ? entries.find((e) => e.patrol === selected.id) ?? null : null;

  return (
    <div className="flex flex-col overflow-hidden bg-scout-bg-app text-scout-text">
      <header className="shrink-0 bg-scout-blue text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {mode === "score" ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setSelected(null); setMode("pick"); }}
                className="text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Zpět"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-scout-yellow" />
            )}
            <div className="min-w-0">
              <div className="text-11 text-white/50">
                Stanoviště
              </div>
              <div className="truncate text-20 font-bold leading-tight">{station.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden bg-white/10 text-white/80 sm:inline-flex">
              {entries.length}/{payload.patrols.length} hlídek
            </Badge>
            <Button variant="ghost" size="icon" onClick={refresh} className="text-white/80 hover:bg-white/10 hover:text-white" aria-label="Obnovit">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={logoutStation} className="text-white/80 hover:bg-white/10 hover:text-white" aria-label="Odhlásit stanoviště">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto px-3.5 py-4 sm:px-6 sm:py-6">
        {mode === "pick" ? (
          <div className="min-h-0 w-full">
            <PatrolPicker
              className="h-full"
              patrols={payload.patrols}
              entries={entries}
              selectedId={selected?.id ?? null}
              onSelect={onSelect}
            />
          </div>
        ) : selected ? (
          <div className="min-h-0 w-full">
            <ScoreForm
              patrol={selected}
              criteria={station.criteria.map((c, index) => ({ ...c, id: index }))}
              allowHalfPoints={station.allow_half_points === true}
              existing={existingForSelected}
              onSaved={onSaved}
              onCancel={() => { setSelected(null); setMode("pick"); }}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
