"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCreateRace } from "@/lib/queries/races";
import type { Race } from "@/lib/api/types";
import { toast } from "sonner";
import { FormEvent, useState } from "react";

function stateBadge(state: Race["state"]) {
  const map: Record<Race["state"], { label: string; variant: "secondary" | "default" | "muted" }> = {
    draft: { label: "Rozpracováno", variant: "muted" },
    ready: { label: "Připraven", variant: "secondary" },
    active: { label: "Běží", variant: "default" },
    closed: { label: "Uzavřeno", variant: "secondary" },
  };
  return map[state] ?? map.draft;
}

export function RaceSelector({
  races,
  current,
  onPick,
  onCreated,
  variant = "header",
}: {
  races: Race[];
  current: Race | null;
  onPick: (id: string) => void;
  onCreated: (race: Race) => void;
  variant?: "header" | "menu";
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const createRace = useCreateRace();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const race = await createRace.mutateAsync({ name, date: date || null, location: location || null });
      onCreated(race);
      setOpen(false);
      setName("");
      setDate("");
      setLocation("");
      toast.success("Závod založen.");
    } catch {
      toast.error("Založení se nezdařilo.");
    }
  }

  const selectTriggerClass = variant === "header"
    ? "h-8 w-[300px] rounded-8 border border-white/20 bg-white/10 px-3 text-13 font-medium text-white shadow-none data-[placeholder]:text-white/60"
    : "h-9 w-full rounded-8 border border-scout-border bg-white px-3 text-13 font-medium text-scout-text shadow-none";
  const buttonClass = variant === "header"
    ? "border-white/20 bg-white/10 text-white/85 hover:bg-white/15 hover:text-white"
    : "w-full justify-center";

  return (
    <div className={`flex gap-2 ${variant === "menu" ? "w-full flex-col" : "items-center"}`}>
      {races.length > 0 ? (
        <Select value={current?.id ?? undefined} onValueChange={onPick}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Vyber závod…" />
          </SelectTrigger>
          <SelectContent>
            {races.map((r) => {
              const s = stateBadge(r.state);
              return (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">
                    {r.name}
                    <Badge variant={s.variant} className="text-[10px] px-1 py-0.30">{s.label}</Badge>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className={buttonClass}>
            <Plus className="h-4 w-4" />
            Nový závod
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nový závod</DialogTitle>
            <DialogDescription>Základní údaje. Kategorie a stanoviště doplníš v tabech.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="race-name">Název</Label>
              <Input
                id="race-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Svojsíkův závod — okresní kolo"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="race-date">Datum</Label>
                <Input id="race-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="race-location">Místo</Label>
                <Input
                  id="race-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Kokořín"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createRace.isPending}>
                Vytvořit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
