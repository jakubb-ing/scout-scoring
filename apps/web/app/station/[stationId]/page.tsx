"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, LogOut, Phone, QrCode, RefreshCw, WifiOff } from "lucide-react";
import { AppVersion } from "@/components/app-version";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { OfflineIndicator } from "@/components/station/offline-indicator";
import { RaceNotStarted } from "@/components/station/race-not-started";
import { PatrolPicker } from "@/components/station/patrol-picker";
import { ScoreForm } from "@/components/station/score-form";
import { useStationLogin, useStationMe, useStationEntries } from "@/lib/queries/station";
import { qk } from "@/lib/queries/keys";
import { ApiError, tokens } from "@/lib/api/client";
import { useIsOffline } from "@/lib/offline/online";
import { useOutboxStatus } from "@/lib/offline/hooks";
import { clearOutbox, resumeAuthBlocked } from "@/lib/offline/outbox";
import { stationChainKey, pendingEntryFromPayload, type StationScorePayload } from "@/lib/offline/register";
import type { Patrol, ScoreEntry } from "@/lib/api/types";
import { useEffect, useMemo, useState } from "react";

type Mode = "pick" | "score";
type PinExchangeState = "idle" | "pending" | "success" | "error";

const LAST_STATION_KEY = "ss.station_last_id";

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
  const isOffline = useIsOffline();

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
        window.localStorage.setItem(LAST_STATION_KEY, stationId);
        qc.invalidateQueries({ queryKey: qk.stationScope(stationId) });
        // Zápisy zablokované na 401 (reset PINu) se po re-loginu vrací
        // do fronty — re-login outbox nikdy nemaže.
        void resumeAuthBlocked(stationChainKey(stationId));
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
    refetch: refetchStationMe,
  } = useStationMe(stationId, loginToken ?? undefined, hasStationToken && !loginError);
  const { data: stationEntriesData } = useStationEntries(stationId, stationMeSuccess);

  const outbox = useOutboxStatus(stationChainKey(stationId));

  const [selected, setSelected] = useState<Patrol | null>(null);
  const [mode, setMode] = useState<Mode>("pick");
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const payload = stationMeData;

  useEffect(() => {
    if (payload) window.localStorage.setItem(LAST_STATION_KEY, stationId);
  }, [payload, stationId]);

  // Server entries + neodeslané položky z outboxu. Pending přepisuje
  // serverový záznam stejné hlídky — je novější.
  const entries = useMemo<ScoreEntry[]>(() => {
    const server = stationEntriesData ?? [];
    const pending = outbox.items
      .filter((i) => i.kind === "station.score")
      .map((i) => pendingEntryFromPayload(i.payload as StationScorePayload));
    const pendingPatrols = new Set(pending.map((e) => e.patrol));
    return [...server.filter((e) => !pendingPatrols.has(e.patrol)), ...pending];
  }, [stationEntriesData, outbox.items]);

  // 409 race_not_started — QR i PIN jsou v pořádku, závod jen ještě neběží.
  const notStarted = getNotStartedInfo(loginError) ?? getNotStartedInfo(stationMeError);

  const booting = exchangingPin || (hasStationToken && stationMeLoading);
  const err = loginError ?? stationMeError;
  const loginFailedOffline =
    Boolean(loginError) && !(loginError instanceof ApiError) && !hasStoredStationToken;
  const errorMsg = err
    ? loginFailedOffline || (isOffline && !(err instanceof ApiError))
      ? "Pro první přihlášení stanoviště je potřeba připojení k síti."
      : err instanceof ApiError && err.status === 401
      ? "PIN je neplatný, přístup vypršel nebo je závod uzavřený. Naskenuj QR kód znovu."
      : "Nelze načíst stanoviště. Zkontroluj připojení."
    : !pinFromUrl && !hasStationToken
    ? "Chybí PIN ze QR kódu. Naskenuj kartu stanoviště znovu."
    : null;

  function refresh() {
    qc.invalidateQueries({ queryKey: qk.stationScope(stationId) });
  }

  function doLogout() {
    tokens.clear("station");
    window.localStorage.removeItem(LAST_STATION_KEY);
    void clearOutbox(stationChainKey(stationId));
    qc.removeQueries({ queryKey: qk.stationScope(stationId) });
    router.replace("/station");
  }

  function requestLogout() {
    // Neodeslané zápisy by odhlášení nenávratně smazalo — potvrzení.
    const waitingCount = outbox.pendingCount + outbox.blockedCount + outbox.authBlockedCount;
    if (waitingCount > 0) {
      setLogoutDialogOpen(true);
    } else {
      doLogout();
    }
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

  if (notStarted && !payload) {
    return (
      <RaceNotStarted
        raceName={notStarted.raceName}
        stationName={notStarted.stationName}
        entityLabel="Stanoviště"
        onRetry={async () => {
          if (pinFromUrl) {
            // Uvolnit guard a nechat login effect proběhnout znovu.
            loginAttemptedForPin.current = null;
            setLoginError(null);
          } else {
            await refetchStationMe();
          }
        }}
      />
    );
  }

  if (booting) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  // Chyba se ukazuje jen bez dat — když payload v (persistované) cache je,
  // jede se dál a stav hlásí offline indikátor v hlavičce.
  if (!payload) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <EmptyState
          className="max-w-md"
          icon={loginFailedOffline ? <WifiOff className="h-6 w-6" /> : <QrCode className="h-6 w-6" />}
          title={loginFailedOffline ? "Bez připojení" : "Přístup se nezdařil"}
          description={errorMsg ?? "Neznámá chyba."}
          action={
            <Button onClick={doLogout}>
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
  const waitingCount = outbox.pendingCount + outbox.blockedCount + outbox.authBlockedCount;

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
            <OfflineIndicator chainKeyPrefix={stationChainKey(stationId)} />
            <Badge variant="secondary" className="hidden bg-white/10 text-white/80 sm:inline-flex">
              {entries.length}/{payload.patrols.length} hlídek
            </Badge>
            <Button asChild variant="ghost" size="icon" className="text-white/80 hover:bg-white/10 hover:text-white" aria-label="Zavolat pořadateli">
              <a href="tel:776884100">
                <Phone className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="ghost" size="icon" onClick={refresh} className="text-white/80 hover:bg-white/10 hover:text-white" aria-label="Obnovit">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={requestLogout} className="text-white/80 hover:bg-white/10 hover:text-white" aria-label="Odhlásit stanoviště">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto px-3.5 py-4 sm:px-6 sm:py-6">
        {outbox.blockedCount > 0 ? (
          <BlockedEntriesNotice
            items={outbox.items.filter((i) => i.status === "blocked" && i.kind === "station.score")}
            patrols={payload.patrols}
          />
        ) : null}

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
              stationId={stationId}
              patrol={selected}
              criteria={station.criteria.map((c, index) => ({ ...c, id: index }))}
              allowHalfPoints={station.allow_half_points === true}
              existing={existingForSelected}
              onSaved={onSaved}
              onCancel={() => { setSelected(null); setMode("pick"); }}
            />
          </div>
        ) : null}

        <div className="mt-8 text-center">
          <AppVersion />
        </div>
      </main>

      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odhlásit stanoviště?</DialogTitle>
            <DialogDescription>
              {waitingCount === 1
                ? "1 zápis ještě nebyl odeslán do databáze."
                : `${waitingCount} zápisy ještě nebyly odeslány do databáze.`}{" "}
              Odhlášením budou nenávratně ztraceny.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLogoutDialogOpen(false)}>
              Zůstat přihlášen
            </Button>
            <Button variant="destructive" onClick={doLogout}>
              Odhlásit a zahodit zápisy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getNotStartedInfo(err: unknown): { raceName?: string; stationName?: string } | null {
  if (
    err instanceof ApiError &&
    err.status === 409 &&
    typeof err.body === "object" &&
    err.body !== null &&
    (err.body as { error?: string }).error === "race_not_started"
  ) {
    const body = err.body as { race_name?: string; station_name?: string };
    return { raceName: body.race_name, stationName: body.station_name };
  }
  return null;
}

function BlockedEntriesNotice({
  items,
  patrols,
}: {
  items: { payload: unknown }[];
  patrols: Patrol[];
}) {
  const names = new Map(patrols.map((p) => [p.id, p.name]));
  return (
    <div className="mb-4 rounded-12 border border-scout-yellow-border bg-scout-yellow-soft p-4 text-13">
      <div className="mb-2 font-semibold">
        {items.length === 1
          ? "1 hodnocení nešlo odeslat — závod byl mezitím uzavřen."
          : `${items.length} hodnocení nešlo odeslat — závod byl mezitím uzavřen.`}
      </div>
      <p className="mb-2 text-scout-text-muted">
        Body předej organizátorovi — může je zapsat přes záložku „Opravy".
      </p>
      <ul className="space-y-1">
        {items.map((item, index) => {
          const p = item.payload as StationScorePayload;
          const total = p.scores.reduce((sum, s) => sum + (Number(s.points) || 0), 0);
          return (
            <li key={index} className="font-mono text-12">
              {names.get(p.patrol_id) ?? p.patrol_id}:{" "}
              {p.scores.map((s) => `${s.criterion} ${s.points}`).join(", ")} (celkem {total} b.)
            </li>
          );
        })}
      </ul>
    </div>
  );
}
