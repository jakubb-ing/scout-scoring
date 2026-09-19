# Záložka Statistiky

Implementováno v `apps/web/components/organizer/stats-tab.tsx`
(endpoint `GET /api/races/:race_id/stats`, `dashboard_controller.ex`).

Top-level záložka v dashboardu vedle *Stanoviště* (ikona `BarChart3`), dvě
podzáložky: **Stanoviště** a **Hlídky**. Zobrazuje se **až po uzavření závodu**
(`race.state === "closed"`), jinak není v navigaci vůbec (`page.tsx`, `canStats`).

Původní referenční prototyp (`docs/stats-tab.jsx` + `stats.html`/`stats2.html`)
už v repu není — zdrojem pravdy je implementace.

## Hlavička

Pill přepínač podzáložek vlevo; vpravo „Počítáno z N zápisů · X hlídek ·
Y stanovišť" a **Export CSV**. Pod tím věta, že pořadí v záložce je
analytické. Žádný filtr kategorií — kategorie se řeší barvou a v podzáložce
Hlídky celým srovnáním.

## 1) Stanoviště

1. **Rozdělení bodů podle stanoviště** — box plot min/Q1/medián/Q3/max,
   normalizovaný na % maxima. Klik vybírá stanoviště pro detail níže.
2. **Rozlišovací schopnost stanovišť** — tabulka: zápisů, Ø bodů, Ø % max,
   σ (b.), σ (% max), podíl na rozptylu, korelace s pořadím (`r`), badge.
   Řádek je klikatelný, výběr sdílí s box ploty.
3. **Detail vybraného stanoviště** — tři karty: rozpad na kritéria
   (kritérium s nulovým ziskem červeně + varování; stanoviště bez zápisů
   ukáže „bez zápisů", ne varování), histogram (6 binů), provoz stanoviště
   (opravy, fronta, Ø doba, zápisů hotovo, jmenný seznam chybějících hlídek).

**Badge `verdict()`**: `share < 3 % || σ < 4 % max` → NEROZLIŠUJE;
`share ≥ 16 %` → ROZHODLO ZÁVOD; jinak Přispívá.

Řádky fronty a Ø doby se skrývají, když závod nemá `time_tracking`.

## 2) Hlídky

1. **Srovnání kategorií** — nadpis s počty (nesoutěžní kategorie je ze
   srovnání vyloučená a je to uvedené), karty kategorií, přímé srovnání
   metrik, klíčové rozdíly.
2. **Rozsah skóre hlídek** — min→max pás s markerem Ø a mediánu.
3. **Rozložení celkových skóre** — histogram, barva = kategorie.
4. **Heatmapa hlídka × stanoviště** — z-skóre v rámci stanoviště,
   modrá/červená škála, „–" = chybějící zápis, červený rámeček u z ≤ −2,2
   = pravděpodobně chybný zápis. Jen ke čtení, neklikatelná.

**Mimo rozsah** (rozhodnuto 2026-09-19): těsné souboje do 2 bodů a detail
hlídky (pořadí/percentil, silné a slabé stránky, „co kdyby bez nejhoršího
stanoviště"). Komponenty byly z kódu odstraněny.

## Data

`GET /races/:race_id/stats` vrací celou matici, ne agregáty — z-skóre,
korelace i σ počítá frontend:

- `stations`: `id, name, position, max_points, criteria[]`, `ops`
  (počet oprav z `corrected_at`, fronta a Ø doba z `arrived_at`/`departed_at`,
  časové metriky jen při zapnutém `time_tracking`);
- `patrols`: `id, start_number, name, category_id, category_name,
  category_scored, withdrawn`;
- `entries`: `station_id, patrol_id, total_points, criteria{}` — chybějící
  zápis prostě není v seznamu, nikdy se neposílá jako nula.

Velikost je zanedbatelná (200 hlídek × 15 stanovišť). Data se po uzavření
závodu nemění, takže dotaz má `staleTime: Infinity`.

## Na co si dát pozor

- **Imputace.** Chybějící zápis se pro součty nahrazuje průměrem stanoviště,
  takže pořadí v této záložce je analytické, ne výsledkové. V UI je to
  napsané pod hlavičkou.
- **Odstoupené hlídky** se do statistiky nepočítají nikde — ani ve stanovištích,
  ani v rozpadu na kritéria.
- **Klíč kritéria** v zápisu je název (`score-form.tsx` posílá `criterion: c.name`);
  rozpad na kritéria má fallback na `id` kvůli starším datům.
