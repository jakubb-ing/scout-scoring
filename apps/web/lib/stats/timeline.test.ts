import { describe, expect, it } from "vitest";

import type { RaceStatsEntry } from "@/lib/api/types";
import {
  axisRange,
  axisTickStep,
  cadenceStep,
  formatSpan,
  gapStats,
  hhmm,
  localMinutes,
  resolveEntryTime,
  wallClockMinutes,
} from "./timeline";

function entry(over: Partial<RaceStatsEntry>): RaceStatsEntry {
  return {
    station_id: "station:1",
    patrol_id: "patrol:1",
    total_points: 10,
    criteria: {},
    ...over,
  };
}

describe("wallClockMinutes", () => {
  it("čte hodiny a minuty bez posunu zóny", () => {
    // Ruční čas leží v DB jako lokální čas označený jako UTC — kdybychom ho
    // pustili přes Date, posunul by se o offset zóny.
    expect(wallClockMinutes("2026-06-14T10:15:00Z")).toBe(10 * 60 + 15);
    expect(wallClockMinutes("2026-06-14T08:00:00")).toBe(8 * 60);
  });

  it("vrací null pro prázdnou nebo nesmyslnou hodnotu", () => {
    expect(wallClockMinutes(null)).toBeNull();
    expect(wallClockMinutes(undefined)).toBeNull();
    expect(wallClockMinutes("2026-06-14")).toBeNull();
  });
});

describe("localMinutes", () => {
  it("převádí UTC do lokálního času prohlížeče", () => {
    const iso = "2026-06-14T08:00:00Z";
    const d = new Date(iso);
    expect(localMinutes(iso)).toBe(d.getHours() * 60 + d.getMinutes());
  });

  it("vrací null pro neplatné datum", () => {
    expect(localMinutes("nesmysl")).toBeNull();
    expect(localMinutes(null)).toBeNull();
  });
});

describe("resolveEntryTime", () => {
  it("dává přednost odchodu před příchodem", () => {
    const t = resolveEntryTime(
      entry({ arrived_at: "2026-06-14T10:00:00Z", departed_at: "2026-06-14T10:20:00Z" })
    );
    expect(t).toEqual({ minutes: 10 * 60 + 20, estimated: false });
  });

  it("použije příchod, když odchod chybí", () => {
    const t = resolveEntryTime(entry({ arrived_at: "2026-06-14T09:05:00Z" }));
    expect(t).toEqual({ minutes: 9 * 60 + 5, estimated: false });
  });

  it("spadne na created_at a označí čas jako odhad", () => {
    const iso = "2026-06-14T12:00:00Z";
    const t = resolveEntryTime(entry({ created_at: iso }));
    expect(t?.estimated).toBe(true);
    expect(t?.minutes).toBe(localMinutes(iso));
  });

  it("vrací null, když není žádný čas", () => {
    expect(resolveEntryTime(entry({}))).toBeNull();
  });
});

describe("gapStats", () => {
  it("počítá medián a maximum odstupů", () => {
    expect(gapStats([0, 10, 20, 60])).toEqual({ med: 10, max: 40 });
  });

  it("interpoluje medián u sudého počtu odstupů", () => {
    expect(gapStats([0, 10, 30]).med).toBe(15);
  });

  it("u jediného zápisu nemá co počítat", () => {
    expect(gapStats([120])).toEqual({ med: null, max: null });
    expect(gapStats([])).toEqual({ med: null, max: null });
  });
});

describe("axisRange", () => {
  it("nechá rezervu a zaokrouhlí na čtvrthodiny", () => {
    const { t0, t1 } = axisRange([8 * 60 + 42, 14 * 60 + 10]);
    expect(t0).toBe(8 * 60 + 30);
    expect(t1).toBe(14 * 60 + 30);
  });

  it("jediný zápis nedá osu nulové šířky", () => {
    const { t0, t1 } = axisRange([10 * 60]);
    expect(t1 - t0).toBeGreaterThanOrEqual(60);
  });

  it("stejné časy (offline sync) taky dají použitelnou osu", () => {
    const { t0, t1 } = axisRange([9 * 60, 9 * 60, 9 * 60]);
    expect(t1 - t0).toBeGreaterThanOrEqual(60);
  });

  it("bez dat vrátí rozumné výchozí okno", () => {
    expect(axisRange([])).toEqual({ t0: 8 * 60, t1: 16 * 60 });
  });
});

describe("cadenceStep", () => {
  it("drží počet sloupců v rozumném rozmezí", () => {
    for (const span of [90, 180, 240, 360, 420, 600]) {
      const bins = Math.ceil(span / cadenceStep(span));
      expect(bins).toBeGreaterThanOrEqual(6);
      expect(bins).toBeLessThanOrEqual(16);
    }
  });
});

describe("formátování", () => {
  it("hhmm doplňuje nulu k minutám", () => {
    expect(hhmm(8 * 60 + 5)).toBe("8:05");
    expect(hhmm(14 * 60)).toBe("14:00");
  });

  it("formatSpan vynechá hodiny, když žádné nejsou", () => {
    expect(formatSpan(45)).toBe("45 min");
    expect(formatSpan(155)).toBe("2 h 35 min");
  });

  it("popisky osy zhoustnou u krátkého závodu", () => {
    expect(axisTickStep(90)).toBe(30);
    expect(axisTickStep(300)).toBe(60);
  });
});
