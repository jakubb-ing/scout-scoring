"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, QrCode } from "lucide-react";
import { AppVersion } from "@/components/app-version";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveStationRaces, useActiveStations } from "@/lib/queries/station";

export default function StationEntryPage() {
  const router = useRouter();
  const { data: racesData, isLoading: racesLoading } = useActiveStationRaces();
  const [raceId, setRaceId] = useState("");
  const [stationId, setStationId] = useState("");
  const [pin, setPin] = useState("");
  const { data: stationsData, isLoading: stationsLoading } = useActiveStations(raceId || undefined);

  const races = racesData ?? [];
  const stations = stationsData ?? [];
  const selectedRace = useMemo(() => races.find((race) => race.id === raceId) ?? null, [races, raceId]);

  useEffect(() => {
    setStationId("");
  }, [raceId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stationId || !pin.trim()) return;
    router.push(`/station/${encodeURIComponent(stationId)}?pin=${encodeURIComponent(pin.trim())}`);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-scout-bg-app px-6 py-10 text-scout-text">
      <div className="w-full max-w-lg rounded-12 border border-scout-border bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2.25 w-2.25 rounded-full bg-scout-yellow" />
          <span className="text-15 font-bold tracking-tightest text-scout-blue">Scout Scoring</span>
        </div>

        <div className="mb-6">
          <h1 className="text-22 font-bold tracking-tight">Přihlášení stanoviště</h1>
          <p className="mt-1.5 text-13 text-scout-text-muted">Vyber běžící závod, stanoviště a zadej PIN z Login Card.</p>
        </div>

        {!racesLoading && races.length === 0 ? (
          <EmptyState
            icon={<QrCode className="h-6 w-6" />}
            title="Žádný běžící závod"
            description="Aktuálně není spuštěný žádný závod se stanovišti."
          />
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>Závod</Label>
              <Select value={raceId} onValueChange={setRaceId} disabled={racesLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={racesLoading ? "Načítám závody" : "Vyber závod"} />
                </SelectTrigger>
                <SelectContent>
                  {races.map((race) => (
                    <SelectItem key={race.id} value={race.id}>
                      {race.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRace?.location ? (
                <p className="text-12 text-scout-text-muted">{selectedRace.location}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Stanoviště</Label>
              <Select
                value={stationId}
                onValueChange={setStationId}
                disabled={!raceId || stationsLoading || stations.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!raceId ? "Nejdřív vyber závod" : stationsLoading ? "Načítám stanoviště" : "Vyber stanoviště"} />
                </SelectTrigger>
                <SelectContent>
                  {stations.map((station) => (
                    <SelectItem key={station.id} value={station.id}>
                      #{station.position} · {station.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {raceId && !stationsLoading && stations.length === 0 ? (
                <p className="text-12 text-destructive">Tento závod nemá dostupná aktivní stanoviště.</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="station-pin">PIN</Label>
              <Input
                id="station-pin"
                type="number"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                disabled={!stationId}
              />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={!stationId || !pin.trim()}>
              <LogIn className="h-4 w-4" />
              Přihlásit
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <AppVersion />
        </div>
      </div>
    </main>
  );
}
