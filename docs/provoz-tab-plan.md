# Podzáložka Provoz

**Stav: implementováno** (2026-09-19). Komponenty jsou v
`apps/web/components/organizer/stats-tab.tsx`, čisté funkce osy v
`apps/web/lib/stats/timeline.ts` (+ `timeline.test.ts`).

Třetí podzáložka ve Statistikách vedle *Stanoviště* a *Hlídky*. Referenční
prototyp: `docs/stats-new-tab.html` (bundle; zdroj = 897 řádků JSX uvnitř,
komponenty `StationLanes`, `Cadence`, `ProvozTable`, `StatsProvoz`).
Implementace patří do `apps/web/components/organizer/stats-tab.tsx`.

Rozsah: **jen pohled po stanovištích** (řádek = stanoviště). Pohled po
hlídkách se nedělá.

## Obsah podzáložky

1. **Časová osa zápisů** (`StationLanes`) — jeden řádek na stanoviště,
   vodorovná osa = čas závodu. Každý zápis je kolečko, barva = skóre v %
   maxima (škála 35 % → 95 %+). Klik na řádek vybere stanoviště pro detail,
   nevybrané řádky ztmavnou na `opacity .55`, vybraný je vyšší a kolečka
   nesou startovní číslo hlídky. Vpravo shrnutí `8:42–14:10 · 11×`.
   Pod osou legenda barev + věta „Každý bod = jeden zápis výsledku".
2. **Detail vybraného stanoviště** — nadpis `Detail — 3 · Topografie`
   a dvě karty vedle sebe:
   - **Provozní přehled** — první zápis, poslední zápis, celá směna,
     zápisů `n / celkem hlídek`, medián odstupu, nejdelší pauza
     (nad 60 min oranžově).
   - **Kadence zápisů** — sloupcový graf počtu zápisů po časových oknech,
     špička žlutě, pod tím věta s nejdelší pauzou a mediánem odstupu.
3. **Pořadí zápisů** (`ProvozTable`) — tabulka: čas zápisu, hlídka
   (s barvou kategorie), odstup od předchozího (≥ 2× medián oranžově a tučně),
   body, % max.

## Odkud se bere čas — a proč to není triviální

`score_entry` nese tři použitelné časy (`001_initial_schema.surql:97–101`):

| pole | význam | spolehlivost |
|---|---|---|
| `arrived_at` / `departed_at` | ručně zadaný čas průchodu hlídky | pravdivé, ale nepovinné (`score-form.tsx:166`, přepínač „withTime") |
| `created_at` | kdy zápis dorazil na server | vždy existuje, ale offline stanoviště ho slije do okamžiku synchronizace |

**Zvolené řešení — hybrid:** `t = departed_at ?? arrived_at ?? created_at`.
Zápis, který spadl na `created_at`, se v ose kreslí **jako prstenec místo
plného kolečka** a v tabulce dostane poznámku „čas ze synchronizace". Bez
toho by osa tvrdila, že čtyři hlídky prošly stanovištěm ve stejnou minutu.

**Pozor na časové pásmo.** Ruční čas se ukládá jako `${today}T${HH:MM}:00`
bez zóny a backend ho čte přes `DateTime.from_naive!(ndt, "Etc/UTC")`
(`dashboard_controller.ex`, `parse_datetime/1`), takže v DB leží lokální
čas označený jako UTC. `created_at` je naproti tomu skutečné UTC. Míchat je
na jedné ose beze změny by fallbackové body posunulo o offset zóny (v létě
o 2 h). Osa proto pracuje s **hodinami na stěně**: ruční čas se čte jako
`HH:MM` z řetězce (bez konverze zóny), `created_at` se převede do lokálního
času prohlížeče. Tohle je nutné otestovat, ne odhadnout.

## Backend

Jediná změna: `stats/2` v `apps/api/lib/api_web/controllers/dashboard_controller.ex`
přidá do položek `entries` časy, které už stejně načítá:

```elixir
%{
  station_id: ..., patrol_id: ..., total_points: ..., criteria: ...,
  arrived_at: entry["arrived_at"],
  departed_at: entry["departed_at"],
  created_at: entry["created_at"],
  corrected_at: entry["corrected_at"]
}
```

Žádný nový endpoint, žádný nový dotaz. `RaceStatsEntry` v
`apps/web/lib/api/types.ts` se rozšíří o stejná čtyři pole (všechna
`string | null`).

## Frontend

Nová sekce v `stats-tab.tsx` (pod stávající `// ─── HLÍDKY` bloky):

- `resolveEntryTime(entry)` → `{ minutes: number, estimated: boolean } | null`
  — implementuje pravidlo výše, vrací minuty od půlnoci.
- `PROV` v hlavním `useMemo`: pro každé stanoviště seřazené řádky
  `{ patrol, t, estimated, score, pct }`, `first`, `last`, `gapMed`, `gapMax`.
  Počítá se **jen z aktivních hlídek**, stejně jako zbytek statistiky.
- `TimeAxis`, `StationLanes`, `Cadence`, `ProvozTable`, `StatsProvoz` —
  převzato z prototypu, přepsané na Tailwind a `scout-*` barvy jako zbytek
  souboru.
- Pill přepínač v hlavičce dostane třetí položku; `subTab` typ se rozšíří
  na `"stanoviste" | "hlidky" | "provoz"`.

**Osa se odvozuje z dat**, ne natvrdo 8:30–15:00 jako v prototypu:
`T0 = floor(min(t) − 10 min)` na čtvrthodinu, `T1 = ceil(max(t) + 10 min)`.
Popisky po hodině; když je rozpětí pod 2 h, po 30 minutách.

**Šířka okna kadence** podle rozpětí, ať sloupců zůstane 12–16:
do 3 h → 15 min, do 6 h → 30 min, nad 6 h → 60 min. Podnadpis karty se
mění podle zvoleného kroku.

## Okrajové případy

- **Stanoviště bez zápisů** — prázdný řádek s poznámkou „bez zápisů",
  v detailu KPI pomlčky. Nesmí spadnout na `Math.max()` z prázdného pole.
- **Jediný zápis** — žádné odstupy, `gapMed`/`gapMax` = „—".
- **Všechny časy stejné** (stanoviště jelo celé offline) — místo osy se
  vypíše upozornění, že zápisy nesou jen čas synchronizace, takže z nich
  provoz vyčíst nejde.
- **Závod bez jediného použitelného času** nemůže nastat, `created_at` je
  povinné — ale pak je celá osa ze samých prstenců a to je potřeba říct
  jednou nahoře, ne u každého bodu.
- **Opravené zápisy** se kreslí na původní čas; `corrected_at` se do osy
  nepromítá (oprava je administrativní úkon, ne provoz).

## Testy

- Backend: rozšířit `apps/api/test/api_web/stats_api_test.exs` o kontrolu,
  že `entries` nesou všechny čtyři časy a že `arrived_at`/`departed_at`
  zůstávají `null`, když je rozhodčí nevyplnil.
- Frontend: `resolveEntryTime` a výpočet `gapMed`/`gapMax` jsou čisté
  funkce — vytáhnout je vedle do testovatelného modulu a pokrýt případy
  z odstavce Okrajové případy (prázdné stanoviště, jediný zápis, fallback
  na `created_at`, půlnoční přetečení neřešíme — závod je jednodenní).
