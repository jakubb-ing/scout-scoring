# Dodatečná editace bodů adminem (po uzavření závodu)

## Výchozí stav (co už v kódu je)

- `Api.Scoring.upsert_entry/5` je jediná cesta k zápisu bodů a na začátku volá
  `ensure_race_open/1` → u `state = "closed"` vrací `{:error, :race_closed}`.
  **Toto je jediný blokující bod.**
- `Api.AuditLog.log/5` už zapisuje `action / actor / race / entity / payload`
  a `upsert_entry` do něj ukládá `before` i `after` (pole `scores`).
- `GET /api/races/:race_id/audit` už existuje (`DashboardController.audit`)
  a vrací posledních 200 záznamů — **ve webu ale zatím není žádné UI.**
- Role: `race_member.role ∈ {"read", "edit"}` + `race.owner`; guard
  `Races.ensure_race_edit/2`.
- Stanice se po `close` nedostane ani k loginu (`race.state = 'active'` ve
  `lookup_station`), takže po uzavření může zapisovat *jen* organizátor.

## Návrh

### 1. Oddělená "correction" cesta, ne obcházení guardu

Nepřidávat `allow_closed?` flag do `upsert_entry` — vzniká riziko, že se
omylem prosákne do station cesty. Místo toho nová funkce:

```elixir
# Api.Scoring
def correct_entry(race_id, station_id, patrol_id, attrs, actor, reason)
```

- **vyžaduje `state == "closed"`** — dodatečné opravy jsou výhradně
  poopravný nástroj, ne druhá cesta k zápisu za běhu závodu. V `active`
  vrací `{:error, :race_not_closed}` (409); běžící závod se opravuje přes
  stanoviště, jak dosud,
- volá `ensure_patrol_belongs/2` a `ensure_station_belongs/2`,
- vyžaduje neprázdný `reason` (min. ~3 znaky) → jinak `{:error, :reason_required}`,
- interně sdílí `do_create/do_update` s `upsert_entry`,
- loguje `score.correct` (ne `score.update`), aby šlo opravy filtrovat.

Autorizace v controlleru: `Races.ensure_race_edit(race_id, organizer_id)` —
tj. owner nebo člen s rolí `edit`. Read-only člen opravovat nesmí.

### 2. Nové routy (organizer scope)

```
POST   /api/races/:race_id/scores/correct     ScoreCorrectionController :upsert
DELETE /api/races/:race_id/scores/:entry_id   ScoreCorrectionController :delete
```

Body: `{ station_id, patrol_id, scores: [{criterion, points}], reason }`.
Delete taky vyžaduje `reason` (query/body), loguje `score.correct_delete`.

### 3. Stopa v datech (migrace 007)

Na `score_entry` přidat:

```sql
DEFINE FIELD IF NOT EXISTS corrected_at ON score_entry TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS corrected_by ON score_entry TYPE option<string>;
DEFINE FIELD IF NOT EXISTS correction_reason ON score_entry TYPE option<string>;
```

Díky tomu jde ve výsledcích u opraveného záznamu zobrazit odznak
"upraveno" s tooltipem (kdo/kdy/proč) bez dotazu do audit logu.

### 4. Audit log — co ukládat

`AuditLog.log("score.correct", "organizer:<id>", race_id, entry_id, %{...})`
s payloadem:

```elixir
%{
  patrol: patrol_id,
  station: station_id,
  reason: reason,
  before: before["scores"],   # nebo nil při dotvoření chybějícího záznamu
  after: entry["scores"],
  before_total: 12,
  after_total: 15,
  race_state: "closed"        # vždy "closed" — jinde oprava neprojde
}
```

Tabulka `audit_log` je append-only a nikde se z ní nemaže → zpětná
dohledatelnost je zajištěná už dnes. Chybí jen:
- indexy: `DEFINE INDEX audit_race_at ON audit_log FIELDS race, at;`
- volitelně `?action=score.correct` filtr v `AuditLog.list_for_race/2`
  a stránkování (dnes tvrdý `LIMIT 200`).

### 5. Frontend

**Nový tab v dashboardu: "Opravy"** (`components/organizer/corrections-tab.tsx`),
viditelný pro `access_role ∈ {owner, edit}` a **jen když `race.state = "closed"`**
— u běžícího závodu se tab vůbec nezobrazí:

1. Matice hlídka × stanoviště (data z `GET /races/:id/results` — už vrací
   `stations`, `patrols`, `score_entries`), buňka = součet bodů nebo "—".
2. Klik na buňku → dialog:
   - vstupy per kritérium (znovupoužít logiku z `components/station/score-form.tsx`,
     vytáhnout sdílenou `CriteriaInputs` komponentu),
   - **povinné pole "Důvod opravy"** — submit disabled bez něj,
   - přehled "původně X → nově Y bodů" před potvrzením.
3. Pod maticí panel **"Historie změn"** = `GET /races/:id/audit`
   (`useAuditLog(raceId)` v `lib/queries/dashboard.ts`), řádky:
   `čas · kdo · hlídka/stanoviště · 12 → 15 b · důvod`.

Po uložení invalidovat `dashboard`, `results` i `audit` query keys.

## Rozsah práce

| Vrstva | Soubory | Odhad |
|---|---|---|
| DB | `priv/surreal/migrations/007_score_corrections.surql` | XS |
| API | `scoring.ex` (+`correct_entry`), nový `score_correction_controller.ex`, `router.ex`, `audit_log.ex` (filtr/paging) | S |
| Testy | `test/api_web/` — oprava v closed závodě projde, v `active` → 409, read-role → 403, chybějící reason → 422, audit záznam vznikl | S |
| Web | `corrections-tab.tsx`, `audit-log-panel.tsx`, sdílené `criteria-inputs`, `lib/api/dashboard.ts`, `lib/queries/dashboard.ts`, `dashboard/page.tsx` | M |

## Rozhodnutí

### R1 — Opravy jen u uzavřeného závodu

Opravovat lze výhradně po `close` (`state = "closed"`); v `active` vrací
409 `race_not_closed`. Za běhu se body mění přes stanoviště, jak dosud.

**Důsledek.** Vzniká jediná cesta k zápisu za běhu závodu, což zjednodušuje
uvažování o konfliktech s offline frontou (viz `offline-station-plan.md`, R2).

### R2 — Veřejné výsledky ukazují, že záznam byl upraven

**Rozhodnutí.** U opraveného záznamu se ve výsledcích zobrazí odznak
„upraveno" s časem poslední změny. **Bez důvodu a bez jména** toho, kdo
opravoval — to zůstává jen v audit logu pro organizátory.

**Odůvodnění.** Zveřejněné výsledky, které se tiše změní, podrývají důvěru
víc než přiznaná oprava. Zároveň je důvod opravy interní informace, která
může zmiňovat konkrétní lidi a do veřejné výsledkovky nepatří.

**Důsledek.** Odznak čte pole `corrected_at` na `score_entry` — proto je
v migraci, ne jen v audit logu.

### R3 — CSV export audit logu je součástí rozsahu

**Rozhodnutí.** Panel „Historie změn" dostane tlačítko „Export CSV".

**Odůvodnění.** Bez něj se odvolací námitka řeší dotazem do databáze ručně,
což je přesně ta situace, kdy se sahá po produkčním přístupu pod tlakem.
Je to ~30 řádků kódu, generované na klientovi z dat, která už stránka má.

**Důsledek.** Export je stránkovaný stejně jako výpis — dnešní tvrdý
`LIMIT 200` v `AuditLog.list_for_race/2` musí padnout dřív, než dává
export smysl.
