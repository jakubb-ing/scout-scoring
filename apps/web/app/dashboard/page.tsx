"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, ClipboardList, LayoutDashboard, LogOut, Loader2, MapPinned, Menu, Settings, Users, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RaceSelector } from "@/components/organizer/race-selector";
import { OverviewTab } from "@/components/organizer/overview-tab";
import { ActivityTab } from "@/components/organizer/activity-tab";
import { PatrolsTab } from "@/components/organizer/patrols-tab";
import { StationsTab } from "@/components/organizer/stations-tab";
import { CorrectionsTab } from "@/components/organizer/corrections-tab";
import { RaceStateFlow } from "@/components/organizer/race-state-flow";
import { SettingsTab } from "@/components/organizer/settings-tab";
import { EmptyState } from "@/components/ui/empty-state";
import * as Auth from "@/lib/api/auth";
import { ApiError, tokens } from "@/lib/api/client";
import { useMe } from "@/lib/queries/auth";
import {
  useActivateRace,
  useCloseRace,
  usePrepareRace,
  useRaces,
  useUnprepareRace,
} from "@/lib/queries/races";
import { useEffect, useState } from "react";

const CURRENT_RACE_KEY = "ss.current_race";

export default function DashboardPage() {
  const router = useRouter();
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    const present = !!tokens.get("organizer");
    setHasToken(present);
    if (!present) router.replace("/login");
  }, [router]);

  const {
    data: meData,
    error: meError,
    isLoading: meLoading,
  } = useMe(hasToken === true);
  const {
    data: racesData,
    error: racesError,
    isLoading: racesLoading,
  } = useRaces();
  const actionRaceId = currentId ?? "__nil__";
  const prepare = usePrepareRace(actionRaceId);
  const unprepare = useUnprepareRace(actionRaceId);
  const activate = useActivateRace(actionRaceId);
  const close = useCloseRace(actionRaceId);

  useEffect(() => {
    const err = meError ?? racesError;
    if (!err) return;
    if (err instanceof ApiError && err.status === 401) {
      Auth.logout();
      router.replace("/login");
      return;
    }
    toast.error("Nepodařilo se načíst data.");
  }, [meError, racesError, router]);

  useEffect(() => {
    const list = racesData;
    if (!list || currentId !== null) return;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(CURRENT_RACE_KEY) : null;
    const pick = list.find((r) => r.id === saved)?.id ?? list[0]?.id ?? null;
    if (pick) setCurrentId(pick);
  }, [racesData, currentId]);

  useEffect(() => {
    if (currentId && typeof window !== "undefined") {
      window.localStorage.setItem(CURRENT_RACE_KEY, currentId);
    }
  }, [currentId]);

  const races = racesData ?? [];
  const current = races.find((r) => r.id === currentId) ?? null;
  const booting = hasToken === null || (hasToken && (meLoading || racesLoading));
  // Opravy bodů jsou výhradně poopravný nástroj — tab dává smysl jen
  // u uzavřeného závodu a jen s právem editace.
  const canCorrect = current?.state === "closed" && current.access_role !== "read";

  useEffect(() => {
    if (tab === "corrections" && !canCorrect) setTab("overview");
  }, [tab, canCorrect]);

  async function onPrepare() {
    if (!confirm("Připravit závod ke spuštění? Vydají se PINy a QR kódy pro stanoviště — v tabu Stanoviště je pak můžeš vytisknout.")) return;
    try {
      await prepare.mutateAsync();
      toast.success("Závod připraven. QR kódy najdeš v tabu Stanoviště.");
    } catch {
      toast.error("Příprava selhala.");
    }
  }

  async function onUnprepare() {
    if (!confirm("Vrátit závod do přípravy? Vytištěné QR kódy zůstávají v platnosti — PINy se nemění.")) return;
    try {
      await unprepare.mutateAsync();
      toast.success("Závod vrácen do přípravy.");
    } catch {
      toast.error("Návrat do přípravy selhal.");
    }
  }

  async function onActivate() {
    try {
      await activate.mutateAsync();
      toast.success("Závod spuštěn.");
    } catch {
      toast.error("Aktivace selhala.");
    }
  }

  async function onClose() {
    if (
      !confirm(
        "Opravdu uzavřít závod? Uzavření je nevratné:\n\n" +
          "• rozhodčí už nebudou moci zapisovat body,\n" +
          "• neodeslané offline zápisy zůstanou zablokované,\n" +
          "• body půjde upravit už jen přes opravy s uvedením důvodu."
      )
    ) return;

    try {
      await close.mutateAsync();
      toast.success("Závod uzavřen.");
    } catch {
      toast.error("Uzavření selhalo.");
    }
  }

  if (booting) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-scout-bg-app text-scout-text">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-screen flex-col">
        <header className="flex h-13 shrink-0 items-center gap-2 bg-scout-blue px-3 text-white sm:gap-3 sm:px-7">
          <div className="flex shrink-0 items-center gap-2">
            <span className="h-2.25 w-2.25 rounded-full bg-scout-yellow" />
            <span className="text-15 font-bold tracking-tightest">Scout Scoring</span>
          </div>
          <div className="hidden h-5 w-px bg-white/20 lg:block" />
          <div className="hidden lg:block">
            <RaceSelector races={races} current={current} onPick={setCurrentId} onCreated={(r) => setCurrentId(r.id)} />
          </div>
          <div className="flex-1" />
          {meData?.is_admin ? (
            <button
              type="button"
              onClick={() => router.push("/users")}
              className="hidden items-center gap-2 rounded-8 border border-white/20 bg-white/10 px-3 py-1.75 text-12 font-medium text-white/80 transition hover:bg-white/15 lg:inline-flex"
            >
              <Users className="h-3.5 w-3.5" />
              Uživatelé
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              Auth.logout();
              router.replace("/login");
            }}
            className="hidden items-center gap-2 rounded-8 border border-white/20 bg-white/10 px-3 py-1.75 text-12 font-medium text-white/80 transition hover:bg-white/15 lg:inline-flex"
          >
            <LogOut className="h-3.5 w-3.5" />
            Odhlásit
          </button>
          <div className="hidden h-8 w-8 shrink-0 place-items-center rounded-full border-1.5 border-white/25 bg-white/15 text-12 font-bold lg:grid">
            {(meData?.name ?? meData?.email ?? "OR").slice(0, 2).toUpperCase()}
          </div>
          <DashboardMobileMenu
            races={races}
            current={current}
            onPick={setCurrentId}
            onCreated={(r) => setCurrentId(r.id)}
            isAdmin={!!meData?.is_admin}
            onUsers={() => router.push("/users")}
            onLogout={() => {
              Auth.logout();
              router.replace("/login");
            }}
          />
        </header>

        {current ? (
          <>
            <section className="flex shrink-0 flex-col gap-3 bg-dashboard-hero px-3 py-3 text-white sm:px-7 sm:py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              <div className="min-w-0 shrink-0">
                <h1 className="truncate text-22 font-bold leading-none">{current.name}</h1>
                <p className="mt-1.25 text-12 text-white/55">
                  {[formatRaceDate(current.date), current.location].filter(Boolean).join(" · ") || "Bez data a místa"}
                </p>
              </div>

              <div className="flex min-w-0 flex-col items-start gap-2 lg:items-end">
                <div className="max-w-full overflow-x-auto pb-0.5">
                  <RaceStateFlow state={current.state} className="min-w-max" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {current.state === "draft" ? (
                    <Button className="bg-white text-scout-blue hover:bg-white/90" onClick={onPrepare} disabled={prepare.isPending}>
                      Připravit ke spuštění
                    </Button>
                  ) : null}
                  {current.state === "ready" ? (
                    <>
                      <Button className="border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white" variant="outline" onClick={onUnprepare} disabled={unprepare.isPending}>
                        Zpět do přípravy
                      </Button>
                      <Button className="bg-white text-scout-blue hover:bg-white/90" onClick={onActivate} disabled={activate.isPending}>
                        Spustit závod
                      </Button>
                    </>
                  ) : null}
                  {current.state === "active" ? (
                    <Button className="border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white" variant="outline" onClick={onClose} disabled={close.isPending}>
                      Uzavřít závod
                    </Button>
                  ) : null}
                  {current.state === "closed" ? (
                    <Button className="bg-white text-scout-blue hover:bg-white/90" onClick={() => router.push(`/dashboard/results?raceId=${encodeURIComponent(current.id)}`)}>
                      Zobrazit výsledky
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>

            <TabsList className="justify-between overflow-hidden px-3 sm:justify-start sm:px-7">
              <TabsTrigger value="overview" className="mb-0 min-w-0 flex-1 gap-2 border-b-2.5 px-2 sm:flex-none sm:px-4.5">
                <LayoutDashboard className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Přehled</span>
              </TabsTrigger>
              <TabsTrigger value="activity" className="mb-0 min-w-0 flex-1 gap-2 border-b-2.5 px-2 sm:flex-none sm:px-4.5">
                <Activity className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Live aktivita</span>
              </TabsTrigger>
              <TabsTrigger value="patrols" className="mb-0 min-w-0 flex-1 gap-2 border-b-2.5 px-2 sm:flex-none sm:px-4.5">
                <ClipboardList className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Hlídky</span>
              </TabsTrigger>
              <TabsTrigger value="stations" className="mb-0 min-w-0 flex-1 gap-2 border-b-2.5 px-2 sm:flex-none sm:px-4.5">
                <MapPinned className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Stanoviště</span>
              </TabsTrigger>
              {canCorrect ? (
                <TabsTrigger value="corrections" className="mb-0 min-w-0 flex-1 gap-2 border-b-2.5 px-2 sm:flex-none sm:px-4.5">
                  <Wrench className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Opravy</span>
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="settings" className="mb-0 min-w-0 flex-1 gap-2 border-b-2.5 px-2 sm:flex-none sm:px-4.5">
                <Settings className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Nastavení</span>
              </TabsTrigger>
            </TabsList>

            <main className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:p-4.5 sm:px-7">
              <TabsContent value="overview" className="h-full">
                <OverviewTab raceId={current.id} />
              </TabsContent>
              <TabsContent value="activity" className="h-full">
                <ActivityTab raceId={current.id} />
              </TabsContent>
              <TabsContent value="patrols" className="h-full">
                <PatrolsTab raceId={current.id} />
              </TabsContent>
              <TabsContent value="stations" className="h-full">
                <StationsTab raceId={current.id} />
              </TabsContent>
              {canCorrect ? (
                <TabsContent value="corrections" className="h-full">
                  <CorrectionsTab raceId={current.id} />
                </TabsContent>
              ) : null}
              <TabsContent value="settings" className="h-full overflow-y-auto">
                <SettingsTab raceId={current.id} />
              </TabsContent>
            </main>
          </>
        ) : (
          <main className="grid flex-1 place-items-center p-3 sm:p-7">
            <EmptyState
              title="Žádný závod"
              description="Začni založením prvního závodu"
            />
          </main>
        )}
      </Tabs>
    </div>
  );
}

function DashboardMobileMenu({
  races,
  current,
  onPick,
  onCreated,
  isAdmin,
  onUsers,
  onLogout,
}: {
  races: Parameters<typeof RaceSelector>[0]["races"];
  current: Parameters<typeof RaceSelector>[0]["current"];
  onPick: Parameters<typeof RaceSelector>[0]["onPick"];
  onCreated: Parameters<typeof RaceSelector>[0]["onCreated"];
  isAdmin: boolean;
  onUsers: () => void;
  onLogout: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white lg:hidden" aria-label="Otevřít menu">
          <Menu className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(330px,calc(100vw-24px))] p-3">
        <DropdownMenuLabel className="px-0 pb-2 pt-0 text-2xs uppercase tracking-0.6 text-scout-text-muted">Závod</DropdownMenuLabel>
        <RaceSelector races={races} current={current} onPick={onPick} onCreated={onCreated} variant="menu" />
        <DropdownMenuSeparator className="my-3" />
        {isAdmin ? (
          <DropdownMenuItem onSelect={onUsers}>
            <Users className="mr-2 h-4 w-4" />
            Uživatelé
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Odhlásit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatRaceDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(date);
}
