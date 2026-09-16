import { describe, expect, it } from "vitest";

import { fastStepFor } from "./point-step";

/**
 * Nejhorší počet kliknutí pro dosažení libovolné hodnoty na mřížce,
 * při startu na nule a s ořezem na 0 a max. Prohledává do šířky, takže
 * počítá i se zkratkou "přejet přes maximum a vrátit se".
 */
function worstClicks(max: number, step: number, fast: number | null) {
  const n = Math.round(max / step);
  const deltas = [1, -1];
  if (fast) {
    const k = Math.round(fast / step);
    deltas.push(k, -k);
  }

  const dist = new Array<number>(n + 1).fill(Infinity);
  dist[0] = 0;
  const queue = [0];
  while (queue.length > 0) {
    const cur = queue.shift() as number;
    for (const d of deltas) {
      const next = Math.min(n, Math.max(0, cur + d));
      if (dist[next] > dist[cur] + 1) {
        dist[next] = dist[cur] + 1;
        queue.push(next);
      }
    }
  }
  return Math.max(...dist);
}

describe("fastStepFor", () => {
  it("u celých bodů drží malá kritéria na jediném páru tlačítek", () => {
    expect(fastStepFor(1, 1)).toBeNull();
    expect(fastStepFor(2, 1)).toBeNull();
    expect(fastStepFor(3, 1)).toBeNull();
  });

  it("u jemného kroku nabídne rychlé tlačítko i malému kritériu", () => {
    // Regrese: 4 body po čtvrtbodech stálo 16 kliknutí, protože se
    // rychlé tlačítko odvozovalo jen z maxima.
    expect(fastStepFor(4, 0.25)).toBe(1.5);
    expect(worstClicks(4, 0.25, fastStepFor(4, 0.25))).toBe(4);
  });

  it("vrací jen násobky 0,5, u celých bodů celá čísla", () => {
    for (const step of [1, 0.5, 0.25]) {
      for (let max = 1; max <= 50; max++) {
        const fast = fastStepFor(max, step);
        if (fast === null) continue;
        const quantum = step < 1 ? 0.5 : 1;
        expect(Number.isInteger(fast / quantum)).toBe(true);
        expect(fast).toBeGreaterThanOrEqual(3 * step);
      }
    }
  });

  it("je proti dřívější heuristice 0,4 * max výrazně lepší a nikde ne o víc než jedno kliknutí horší", () => {
    const previous = (max: number) => {
      const f = Math.floor(0.4 * max);
      return f > 1 ? f : null;
    };

    let better = 0;
    const worse: string[] = [];
    for (const step of [1, 0.5, 0.25]) {
      for (let max = 1; max <= 100; max++) {
        const now = worstClicks(max, step, fastStepFor(max, step));
        const before = worstClicks(max, step, previous(max));
        if (now < before) better++;
        // Zaokrouhlení na násobek 0,5 občas trefí číslo, které rozsah dělí
        // hůř než dřívější 0,4 * max. Stojí to jedno kliknutí navíc a je to
        // přijatelná daň za to, že vzorec zůstane bez hledání kandidátů.
        if (now > before) worse.push(`max ${max}, krok ${step}: ${before} -> ${now}`);
        expect(now - before).toBeLessThanOrEqual(1);
      }
    }

    expect(better).toBeGreaterThan(50);
    expect(worse.length).toBeLessThan(10);
  });

  it("v reálném rozsahu maxim kritérií zhoršuje nanejvýš jednu kombinaci", () => {
    const previous = (max: number) => {
      const f = Math.floor(0.4 * max);
      return f > 1 ? f : null;
    };

    const worse = [];
    for (const step of [1, 0.5, 0.25]) {
      for (let max = 1; max <= 20; max++) {
        if (worstClicks(max, step, fastStepFor(max, step)) > worstClicks(max, step, previous(max))) {
          worse.push([max, step]);
        }
      }
    }

    expect(worse).toEqual([[7, 0.25]]);
  });

  it("ignoruje nesmyslné vstupy", () => {
    expect(fastStepFor(0, 1)).toBeNull();
    expect(fastStepFor(-5, 1)).toBeNull();
    expect(fastStepFor(10, 0)).toBeNull();
    expect(fastStepFor(Number.NaN, 1)).toBeNull();
  });
});
