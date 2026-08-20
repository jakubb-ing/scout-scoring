"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, LayoutDashboard, LogOut, Loader2, MapPinned, Menu, Settings, Users } from "lucide-react";
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
import type { RaceState } from "@/lib/api/types";
import { RaceSelector } from "@/components/organizer/race-selector";
import { OverviewTab } from "@/components/organizer/overview-tab";
import { PatrolsTab } from "@/components/organizer/patrols-tab";
import { StationsTab } from "@/components/organizer/stations-tab";
import { SettingsTab } from "@/components/organizer/settings-tab";
import { EmptyState } from "@/components/ui/empty-state";
import * as Auth from "@/lib/api/auth";
import { ApiError, tokens } from "@/lib/api/client";
import { useMe } from "@/lib/queries/auth";
import { useRaces } from "@/lib/queries/races";
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
            onSettings={() => setTab("settings")}
            onLogout={() => {
              Auth.logout();
              router.replace("/login");
            }}
          />
        </header>

        {current ? (
          <>
            <section className="flex shrink-0 items-center gap-3 bg-dashboard-hero px-3 py-3 text-white sm:gap-4 sm:px-7 sm:py-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.25 flex flex-wrap items-center gap-2.5">
                  <RaceStatePill state={current.state} />
                  <span className="text-12 text-white/55">
                    {[current.location, formatRaceDate(current.date)].filter(Boolean).join(" · ") || "Bez místa a data"}
                  </span>
                </div>
                <h1 className="truncate text-22 font-bold leading-none">{current.name}</h1>
              </div>
            </section>

            <TabsList className="justify-between overflow-hidden px-3 sm:justify-start sm:px-7">
              <TabsTrigger value="overview" className="mb-0 min-w-0 flex-1 gap-2 border-b-2.5 px-2 sm:flex-none sm:px-4.5">
                <LayoutDashboard className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Přehled</span>
              </TabsTrigger>
              <TabsTrigger value="patrols" className="mb-0 min-w-0 flex-1 gap-2 border-b-2.5 px-2 sm:flex-none sm:px-4.5">
                <ClipboardList className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Hlídky</span>
              </TabsTrigger>
              <TabsTrigger value="stations" className="mb-0 min-w-0 flex-1 gap-2 border-b-2.5 px-2 sm:flex-none sm:px-4.5">
                <MapPinned className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Stanoviště</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="mb-0 hidden min-w-0 flex-1 gap-2 border-b-2.5 px-2 lg:inline-flex lg:flex-none lg:px-4.5">
                <Settings className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Nastavení</span>
              </TabsTrigger>
            </TabsList>

            <main className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:p-4.5 sm:px-7">
              <TabsContent value="overview" className="h-full">
                <OverviewTab raceId={current.id} />
              </TabsContent>
              <TabsContent value="patrols" className="h-full">
                <PatrolsTab raceId={current.id} />
              </TabsContent>
              <TabsContent value="stations" className="h-full">
                <StationsTab raceId={current.id} />
              </TabsContent>
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
  onSettings,
  onLogout,
}: {
  races: Parameters<typeof RaceSelector>[0]["races"];
  current: Parameters<typeof RaceSelector>[0]["current"];
  onPick: Parameters<typeof RaceSelector>[0]["onPick"];
  onCreated: Parameters<typeof RaceSelector>[0]["onCreated"];
  isAdmin: boolean;
  onUsers: () => void;
  onSettings: () => void;
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
        <DropdownMenuItem onSelect={onSettings}>
          <Settings className="mr-2 h-4 w-4" />
          Nastavení
        </DropdownMenuItem>
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

function RaceStatePill({ state }: { state: RaceState }) {
  const label =
    state === "active"
      ? "BĚŽÍ"
      : state === "closed"
        ? "UZAVŘENO"
        : state === "ready"
          ? "PŘIPRAVEN"
          : "PŘÍPRAVA";
  const tone =
    state === "active"
      ? "bg-scout-green text-white"
      : state === "ready"
        ? "bg-scout-yellow text-scout-text"
        : state === "closed"
          ? "bg-scout-text-muted text-white"
          : "bg-scout-bg-subtle text-scout-text";
  return (
    <span className={`rounded-full px-2.25 py-0.75 text-2xs font-bold uppercase tracking-0.5 ${tone}`}>
      ● {label}
    </span>
  );
}

function formatRaceDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(date);
}
