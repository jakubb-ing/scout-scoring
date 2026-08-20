# Rozcestník plánů

Přehled rozpracovaných plánů v `docs/`, co obsahují a v jakém pořadí je
implementovat. Žádný z nich zatím **není implementovaný** — jde o návrhy
odsouhlasené se zadavatelem, ne o popis stávajícího stavu.

---

## Přehled

| plán | co řeší | velikost | závisí na |
|---|---|---|---|
| [`versioning-plan.md`](versioning-plan.md) | verzování monorepa, verze v patičce FE | S | — |
| [`offline-station-plan.md`](offline-station-plan.md) | PWA + offline vrstva (cache, outbox) | L | — |
| [`race-ready-state-plan.md`](race-ready-state-plan.md) | nový stav závodu `ready` + stažení hlídky | M | — |
| [`patrol-feedback-plan.md`](patrol-feedback-plan.md) | slovní zpětná vazba od doprovodu hlídky | L | offline, `ready` |
| [`score-correction-plan.md`](score-correction-plan.md) | dodatečná editace bodů adminem + audit UI | M | — |

---

## Co který plán obsahuje

### `versioning-plan.md` — verzování

Zavádí **release-please** (GitHub Action) jako nástroj, který podle
konvenčních commitů otevírá „Release PR" s bumpem verze a CHANGELOGem.
Přes `extra-files` drží v souladu `VERSION`, `apps/api/mix.exs`
i `apps/web/package.json`. Verze se zobrazí v patičce FE — včetně
stanoviště a feedback stránky, kde je to jediný způsob, jak poznat
zastaralou verzi ze service workeru. `/api/health` začne vracet `version`.

Start na `0.1.0`, což odpovídá tomu, co v souborech dnes je.
Repo nemá žádné CI, takže krok 1 zakládá `.github/` od nuly.

### `offline-station-plan.md` — offline režim

Tři vrstvy: **PWA skelet** (Serwist), **read cache** (react-query
persistovaná do IndexedDB, řízená allowlistem query keys) a **outbox**
(fronta mutací v Dexie s registrem `kind → {send, dedupeKey, onApplied}`).
Záměrně **necachuje API odpovědi v service workeru** — jsou cross-origin
a nesly by druhý zdroj pravdy vedle react-query.

Prvním konzumentem je zápis bodů na stanovišti. Vrstva je stavěná tak, aby
další offline část byla jeden řádek v allowlistu a jedna položka v registru,
ne kopie kódu. Součástí je i timeout v `apiFetch` — na louce je reálný
scénář flaky síť, ne tvrdý offline.

### `race-ready-state-plan.md` — stav „připraven ke spuštění"

Nový stav mezi `draft` a `active`:
`draft → ready → active → closed`, plus návrat `ready → draft`.

V `ready` se vydají a vytisknou QR kódy, smí se editovat stanoviště (vše)
a hlídky (jen název + členové), ale nepřidávají a nemažou se. Zápis bodů
ani zpětné vazby ještě neběží — kdo načte QR, uvidí obrazovku „závod ještě
nebyl spuštěn", která pooluje.

Dva netriviální body: vydávání PINů musí být **idempotentní** (jinak by
opakovaný průchod `ready` zneplatnil vytištěné QR) a login musí umět
odlišit „závod neběží" od „špatný PIN" — dnes obojí vrací 401. Plán navíc
řeší **stažení nedostavené hlídky** místo mazání, včetně vynechání
z leaderboardu.

### `patrol-feedback-plan.md` — zpětná vazba od doprovodu

Nová mobile-first offline stránka `/feedback/[patrolId]`. Doprovod načte QR
hlídky a vyplní N textarea „co se povedlo" a M „prostor pro zlepšení"
(počty 0–10 nastavuje admin, celá funkce jde vypnout). Autosave po 5 s,
na závěr „Uzavřít a odeslat". Admin může odeslané **odemknout k editaci**,
ale obsah editovat nesmí. Okno je otevřené do `closed_at + 12 h`.

Souběh dvou zařízení řeší **lock s explicitním převzetím** (409 + tlačítko
„Převzít vyplňování"), ne automatické vypršení. Viditelnost ve veřejných
výsledcích je přepínač v nastavení závodu, default vypnuto — jde o slovní
hodnocení dětí. Loguje se `started` / `submitted` / `reopened` (se snapshotem
obsahu) / `resubmitted` / `taken_over`, autosave ne.

### `score-correction-plan.md` — dodatečná editace bodů

Umožní adminovi opravit body i po uzavření závodu. Dnes to blokuje
`Scoring.ensure_race_open/1`. Plán přidává **oddělenou cestu**
`Scoring.correct_entry/6` s povinným důvodem, ne flag do stávajícího
upsertu — aby se povolení nemohlo prosáknout do station cesty.

Součástí je nová záložka „Opravy" v dashboardu (matice hlídka × stanoviště)
a panel „Historie změn" nad endpointem `GET /races/:id/audit`, který už
existuje, ale **nemá žádné UI**.

---

## Pořadí implementace

```
1. versioning ──┐
                ├─ nezávislé, jde dělat kdykoli
5. score-corr ──┘

2. offline ──▶ 4. feedback
                  ▲
3. ready ─────────┘
```

**1. `versioning-plan.md`** — první, protože je malý, nezávislý a všechno
ostatní se pak vydává už s pořádnou verzí a CHANGELOGem.

**2. `offline-station-plan.md`** — fáze 1–3 (PWA, read cache, outbox) jsou
základ pro feedback stránku. Zadavatel potvrdil, že offline jde první.
Fáze 4 (zapojení stanoviště) ověří, že vrstva funguje na reálném konzumentovi.

**3. `race-ready-state-plan.md`** — musí předběhnout feedback, protože
přesouvá vydávání PINů z `activate_race` do nového `prepare_race`. Kdyby
se feedback dělal dřív, vydávání PINů hlídek by se psalo dvakrát.
Klíčový je krok `issue_tokens_for/3` s režimem `:missing_only`.

**4. `patrol-feedback-plan.md`** — až po 2 i 3. Backend (migrace, token,
endpointy) jde psát souběžně s 3, ale FE stránka potřebuje hotový outbox
a obrazovku „závod nebyl spuštěn" ze stavu `ready`.

**5. `score-correction-plan.md`** — technicky nezávislé, ale **musí být
hotové dřív, než se offline vrstva dostane do ostrého provozu**. Záložka
„Opravy" je jediná cesta, jak zachránit offline zápis zablokovaný uzavřením
závodu (viz rozhodnutí offline R3). Jde ho tedy dělat souběžně s krokem 2.

### Migrace schématu

Pořadí migrací se řídí pořadím mergování, ne pořadím sepsání plánů.
`score-correction-plan.md` i `patrol-feedback-plan.md` si dnes oba nárokují
`007` — čísla se přidělí až při implementaci. Poslední existující migrace
je `006_backfill_public_code.surql`.

Podle doporučeného pořadí to vychází na:

| migrace | plán |
|---|---|
| `007` | `ready` stav + `prepared_at` + `patrol.withdrawn*` |
| `008` | `feedback_*` na race, `feedback_pin` na patrol, tabulka `patrol_feedback` |
| `009` | `corrected_*` na `score_entry` + index `audit_log(race, at)` |

---

## Rozhodnutí

Všechny otevřené otázky jsou uzavřené. Rozhodnutí jsou zapsaná v ADR-lite
formátu (kontext → rozhodnutí → důsledek) v sekci „Rozhodnutí" příslušného
plánu, aby zůstala u kontextu, kterého se týkají.

| # | rozhodnutí | kde |
|---|---|---|
| R1 | Outbox nepotřebuje klientská ID — všechny offline mutace jsou upserty podle přirozeného klíče | offline |
| R2 | Konflikt offline zápisu s opravou: last-write-wins, bez verzování (invariantu hlídá test) | offline |
| R3 | **423 po uzavření závodu se nesmí zahodit** — položka zůstane v outboxu jako `blocked` | offline |
| R4 | **401 se také nezahazuje** — `blocked` + výzva k re-loginu; re-login nemaže outbox | offline |
| R1 | Opravy bodů jen u uzavřeného závodu | score-correction |
| R2 | Veřejné výsledky ukazují „upraveno" + čas, bez důvodu a jména | score-correction |
| R3 | CSV export audit logu je součástí rozsahu | score-correction |
| R1 | V patičce je i git hash — u PWA diagnostická nutnost | versioning |
| R2 | Kontrola názvu PR (squash-merge dělá z názvu commit zprávu) | versioning |
| R3 | release-please vytváří i GitHub Release | versioning |

`patrol-feedback-plan.md` a `race-ready-state-plan.md` nemají otevřené body
— jejich zadání bylo odsouhlasené v celém rozsahu.

Při revizi 2026-08-20 byly dodefinovány hrany napříč plány (detaily přímo
v příslušných plánech): update strategie service workeru, chování 401
v outboxu (offline R4), cross-tab zámek a řetězení flusheru per hlídka,
prodloužení feedback okna reopenem (`max(closed_at, reopened_at) + 12 h`),
reset `is_active` při `unprepare`, varování při mazání entit po `prepare`
a výčet důsledků nevratného `close` v potvrzovacím dialogu.

Platí navíc průřezově: **migrace schématu je vždy minimálně MINOR bump.**

### Vazba, která vznikla až rozhodováním

Offline R3 a score-correction R1 na sebe navazují: zablokovaná offline
položka se dá zachránit **jen** přes záložku „Opravy", která funguje jen
u uzavřeného závodu. Kdyby se offline vrstva nasadila dřív než opravy bodů,
existuje stav, kdy aplikace hlásí „nešlo odeslat" a nenabízí cestu ven.
Buď implementovat opravy bodů dřív, než se offline vrstva dostane do ostrého
provozu, nebo v mezidobí zobrazit alespoň čitelný výpis bodů k ručnímu opsání.
