"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, LogOut, MoreVertical, Phone, QrCode, RefreshCw, WifiOff } from "lucide-react";
import { AppVersion } from "@/components/app-version";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { useStationStatus } from "@/components/station/use-station-status";
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
import { toPointStep, type Patrol, type ScoreEntry } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type Mode = "pick" | "score";
type PinExchangeState = "idle" | "pending" | "success" | "error";

const LAST_STATION_KEY = "ss.station_last_id";

// Položky ⋯ menu jsou sahací cíl na mobilu — větší než výchozí menu item.
const MENU_ITEM = "gap-2.75 rounded-8 px-3.5 py-3 text-14";

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
  // Stejnou cestu používá i tlačítko „Zkusit hned" na obrazovce čekání —
  // chyba se přepisuje až výsledkem nového pokusu, aby se mezitím
  // neobjevila hláška o chybějícím PINu.
  const attemptLogin = React.useCallback(async () => {
    if (!pinFromUrl) return;

    loginAttemptedForPin.current = `${stationId}:${pinFromUrl}`;
    setPinExchangeState("pending");

    try {
      const res = await loginStation({ stationId, pin: pinFromUrl });
      tokens.set("station", res.token);
      window.localStorage.setItem(LAST_STATION_KEY, stationId);
      qc.invalidateQueries({ queryKey: qk.stationScope(stationId) });
      // Zápisy zablokované na 401 (reset PINu) se po re-loginu vrací
      // do fronty — re-login outbox nikdy nemaže.
      void resumeAuthBlocked(stationChainKey(stationId));
      setLoginError(null);
      setLoginToken(res.token);
      setPinExchangeState("success");
    } catch (err) {
      setLoginError(err);
      setPinExchangeState("error");
    }
  }, [pinFromUrl, stationId, loginStation, qc]);

  useEffect(() => {
    const loginAttemptKey = pinFromUrl ? `${stationId}:${pinFromUrl}` : null;
    if (!pinFromUrl || !loginAttemptKey || loginToken || loginAttemptedForPin.current === loginAttemptKey) return;

    void attemptLogin();
  }, [pinFromUrl, loginToken, stationId, attemptLogin]);

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
  // Hlídka, u které se právě uložil zápis — v seznamu se krátce zvýrazní.
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  // Pozice scrollu v seznamu, aby se rozhodčí po uložení vrátil tam, kde byl.
  const listScrollRef = React.useRef(0);
  const mainRef = React.useRef<HTMLElement>(null);

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

  // Postup se ukazuje v hlavičce, ne v seznamu — počítá se tedy tady, kde jsou
  // hlídky i zápisy pohromadě, a PatrolPicker dostává hotová čísla.
  const progress = useMemo(() => {
    const total = payload?.patrols.length ?? 0;
    const doneIds = new Set(entries.map((e) => e.patrol));
    const done = (payload?.patrols ?? []).filter((p) => doneIds.has(p.id)).length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [payload, entries]);

  const status = useStationStatus(stationChainKey(stationId), payload?.station.position ?? undefined);

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
    // Zapamatovat, kde v seznamu rozhodčí byl — po uložení se tam vrátí.
    listScrollRef.current = mainRef.current?.scrollTop ?? 0;
    setSelected(p);
    if (p) setMode("score");
  }

  function backToList() {
    setSelected(null);
    setMode("pick");
    // Obnovit pozici až po vykreslení seznamu.
    requestAnimationFrame(() => {
      if (mainRef.current) mainRef.current.scrollTop = listScrollRef.current;
    });
  }

  function onSaved(patrolId: string) {
    setJustSavedId(patrolId);
    backToList();
  }

  useEffect(() => {
    if (!justSavedId) return;
    const timer = setTimeout(() => setJustSavedId(null), 2_500);
    return () => clearTimeout(timer);
  }, [justSavedId]);

  if (notStarted && !payload) {
    return (
      <RaceNotStarted
        raceName={notStarted.raceName}
        stationName={notStarted.stationName}
        entityLabel="Stanoviště"
        onRetry={pinFromUrl ? attemptLogin : async () => void (await refetchStationMe())}
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
    <div className="flex h-dvh flex-col overflow-hidden bg-scout-bg-app text-scout-text">
      <header className={cn("shrink-0 text-white transition-colors", status.headerClass)}>
        <div className="mx-auto max-w-4xl px-4 pt-2.75">
          <div className="flex items-start gap-2">
            {mode === "score" ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={backToList}
                className="-ml-2 shrink-0 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Zpět"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="mb-0.75 flex items-center gap-1.75">
                <span className={cn("inline-block h-1.75 w-1.75 shrink-0 rounded-full", status.dotClass)} />
                <span className="truncate text-11 font-semibold tracking-0.4 text-white/60">
                  {status.caption}
                </span>
              </div>
              <div className="truncate text-21 font-bold">{station.name}</div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-2 shrink-0 text-white/80 hover:bg-white/10 hover:text-white"
                  aria-label="Další akce"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[214px] rounded-12">
                <DropdownMenuItem onSelect={refresh} className={MENU_ITEM}>
                  <RefreshCw className="h-4.5 w-4.5 text-scout-text-secondary" />
                  Obnovit data
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={MENU_ITEM}>
                  <a href="tel:776884100">
                    <Phone className="h-4.5 w-4.5 text-scout-text-secondary" />
                    Zavolat podporu
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={requestLogout}
                  className={cn(MENU_ITEM, "font-semibold text-scout-red focus:text-scout-red")}
                >
                  <LogOut className="h-4.5 w-4.5" />
                  Odhlásit ze stanoviště
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2.5 py-2.5">
            <div className="h-1.25 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className={cn("h-full rounded-full transition-all", status.barClass)}
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <span className="shrink-0 text-12 font-semibold tabular-nums text-white/75">
              {progress.done} / {progress.total} odbaveno
            </span>
          </div>
        </div>
      </header>

      <main ref={mainRef} className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto px-3.5 pb-4 sm:px-6 sm:pb-6">
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
              highlightId={justSavedId}
              onSelect={onSelect}
            />
          </div>
        ) : selected ? (
          <div className="min-h-0 w-full pt-4">
            <ScoreForm
              stationId={stationId}
              stationName={station.name}
              patrol={selected}
              criteria={station.criteria.map((c, index) => ({ ...c, id: index }))}
              pointStep={toPointStep(station.point_step)}
              existing={existingForSelected}
              onSaved={() => onSaved(selected.id)}
              onCancel={backToList}
            />
          </div>
        ) : null}

        {/* Ve formuláři je patička schovaná pod fixní lištou. */}
        {mode === "pick" ? (
          <div className="mt-8 text-center">
            <AppVersion />
          </div>
        ) : null}
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
    <div className="my-4 rounded-12 border border-scout-yellow-border bg-scout-yellow-soft p-4 text-13">
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
