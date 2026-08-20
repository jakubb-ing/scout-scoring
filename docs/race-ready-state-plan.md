# Nový stav závodu „připraven ke spuštění" (`ready`)

Nový stav mezi `draft` a `active`. Umožňuje vydat a vytisknout QR kódy
a doladit detaily, ale zápis bodů ani zpětné vazby ještě neběží.

```
draft  ──prepare──▶  ready  ──activate──▶  active  ──close──▶  closed
  ▲                    │
  └────unprepare───────┘
```

Rozhodnuto se zadavatelem:
- Přechod přes `ready` je **povinný** — z `draft` nelze skočit rovnou do `active`.
- Návrat `ready → draft` je povolený a **PINy se při něm nemění**.
- **Nedostavená hlídka** se řeší v rámci tohohle plánu (stažení místo mazání).
- Editace v `ready`: hlídka jen **název + členové**; stanoviště **vše**.
- Závod nemá pevný čas startu → QR stránka před spuštěním **pooluje**.
- Závod v `ready` se **nezobrazuje** ve veřejném seznamu závodů.

> **Číslování migrace:** `score-correction-plan.md` i `patrol-feedback-plan.md`
> si dnes oba nárokují `007`. Konečná čísla se přidělí podle pořadí mergování.
> Zde uvádím `00X`.

---

## 1. Klíčové riziko: opakovaný přechod nesmí přegenerovat PINy

Dnešní `issue_tokens_for/2` (`races.ex:141`) generuje PIN i nonce
**bezpodmínečně** každému stanovišti. Kdyby ho `prepare_race` volalo tak,
jak je, pak by cesta `draft → ready → draft → ready` **zneplatnila všechny
už vytištěné QR kódy** — a organizátor by to nepoznal, dokud rozhodčí
v terénu nezačnou hlásit neplatný PIN.

Řešení: `issue_tokens_for/3` dostane režim.

```elixir
# :missing_only — vydá PIN jen tomu, kdo ho ještě nemá (prepare_race)
# :rotate       — přegeneruje všem (dnešní reissue_station_tokens)
defp issue_tokens_for(race, stations, mode)
```

`prepare_race` volá `:missing_only`, takže druhý a další průchod je no-op.
Explicitní rotace zůstává jen pod tlačítkem „Vydat nové QR"
(`reissue_station_tokens/2`), kde je invalidace záměrná a UI na ni varuje.

Totéž platí pro PINy hlídek ze `patrol-feedback-plan.md` — ty se vydávají
ve stejném kroku, taky v režimu `:missing_only`.

**Hranice ochrany:** `:missing_only` chrání jen *existující* záznamy.
Smazání hlídky/stanoviště v `draft` (po návratu z `ready`) a její
znovuzaložení vydá při dalším `prepare` **nový** PIN — vytištěná karta
původní entity tiše přestane platit. UI proto musí u mazání v závodě,
který už prošel `prepare` (`prepared_at` je nastaveno), varovat
(viz sekce Frontend → Hlídky).

---

## 2. Datový model (migrace `00X`)

```sql
-- rozšíření stavu; existující záznamy není třeba backfillovat
DEFINE FIELD OVERWRITE state ON race TYPE string
  ASSERT $value IN ["draft", "ready", "active", "closed"]
  DEFAULT "draft";
DEFINE FIELD IF NOT EXISTS prepared_at ON race TYPE option<datetime>;

-- stažení hlídky ze závodu (náhrada za mazání v ready/active)
DEFINE FIELD IF NOT EXISTS withdrawn ON patrol TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS withdrawn_at ON patrol TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS withdrawn_reason ON patrol TYPE option<string>;
```

`DEFINE FIELD OVERWRITE` je nutné — `IF NOT EXISTS` by starý ASSERT nechalo
být a `ready` by neprošel. Vzor už v repu je (`001:114` u `audit_log.payload`).

---

## 3. Backend

### Přechody

| funkce | z | do | co dělá |
|---|---|---|---|
| `prepare_race/2` | `draft` | `ready` | vydá chybějící PINy (stanoviště + hlídky), `is_active = true` na stanovištích, `prepared_at`, log `race.prepare` |
| `unprepare_race/2` | `ready` | `draft` | **PINy nechává být**, `is_active = false` na stanovištích (zrcadlo `prepare`), log `race.unprepare` |
| `activate_race/2` | `ready` | `active` | **už nevydává tokeny**, jen `state` + `activated_at`, log `race.activate` |
| `close_race/2` | `active` | `closed` | beze změny |

`activate_race/2` se tím zjednoduší — vypadne z něj `issue_tokens_for`.
Volání z jiného stavu než `ready` vrací `{:error, :race_not_ready}` → HTTP 409.

### Guardy

Dnes je jen `ensure_race_draft_edit/2` (`races.ex:803`), používaný na 8 místech.
Rozpad na dva:

- `ensure_race_draft_edit/2` — **pouze `draft`**. Zůstává na *přidávání
  a mazání*: `create_patrol`, `bulk_create_patrols`, `delete_patrol`,
  `create_station`, `bulk_create_stations`, `delete_station`, kategorie.
- `ensure_race_setup_edit/2` — **`draft` nebo `ready`**. Nově na *editaci*:
  `update_patrol`, `update_station`.

### Omezení polí u `update_patrol` v `ready`

V `ready` smí projít jen `name` a `members`. `start_number` a `category`
jsou zamčené — obojí mění zařazení a pořadí ve výsledcích a startovní číslo
je vytištěné na kartách. Filtr attrs podle stavu **v kontextu**
(`races.ex`), ne v controlleru, ať to nejde obejít jiným endpointem.
Pokus o změnu zamčeného pole v `ready` → `{:error, :field_locked}` (409),
ne tiché ignorování.

`update_station` v `ready` propouští vše: `name`, `position`, `criteria`
(včetně `max_points`), `allow_half_points`. QR nese jen `id` + `pin`,
takže tisk zůstává platný.

### Stažení hlídky

```elixir
def withdraw_patrol(patrol_id, organizer_id, reason)   # ready | active
def restore_patrol(patrol_id, organizer_id)
```

- Guard `ensure_race_edit/2` + stav `ready` nebo `active`.
- Log `patrol.withdraw` / `patrol.restore` s důvodem.
- `Scoring.leaderboard/1` stažené hlídky **vynechá** — dnes by seděly na
  konci s nulou a kazily pořadí.
- Dashboard i výsledkovka je zobrazí odděleně jako „nedostavila se".
- Stažená hlídka se **nemaže** — případné už zapsané body a zpětná vazba
  zůstávají v DB a v audit logu.

### Rozlišení „závod ještě neběží" od „špatný PIN"

Dnes `get_active_station/1` (`races.ex:770`) filtruje
`is_active = true AND race.state = 'active'` a při nesplnění vrátí
`:not_found`. Login pak hlásí `401 invalid_station_pin` — tedy ve stavu
`ready` by rozhodčí dostal hlášku o špatném PINu, i když ho má správný.

Změna: lookup přestane stav filtrovat a vrátí ho, rozhodne až volající.

```elixir
def get_station_for_login(id)   # vrací i race_state
# ready  -> {:error, :race_not_started}
# closed -> {:error, :race_closed}
# active -> {:ok, station}
```

`StationController.login` → `409 {"error": "race_not_started", "race_name": ..., "state": "ready"}`.
Ověření PINu proběhne **až po** kontrole stavu, ale hláška o stavu se vrací
i při špatném PINu jen jako obecná — jinak by endpoint prozrazoval,
které `station_id` existuje.

Plug `AuthenticateStation` musí platný token ve stavu `ready` odmítnout
stejným kódem (scénář: závod se vrátil z `active` zpět — dnes nenastane,
ale token přežije 72 h).

Stejná logika pro `/api/feedback/login` z `patrol-feedback-plan.md`.

### Beze změny

`list_active_races_public/0` a `list_active_stations_public/1` — zadavatel
potvrdil, že `ready` závod se ve veřejném seznamu **nemá** objevit.
Ke stanovišti se dá dostat jen přes QR.

---

## 4. Frontend

### Typy a stavový pill

- `RaceState` (`lib/api/types.ts:16`) += `"ready"`.
- `RaceStatePill` (`dashboard/page.tsx:254`) += `PŘIPRAVEN` (žlutá/amber,
  mezi šedou PŘÍPRAVA a zelenou BĚŽÍ).
- **Pozor:** `stations-tab.tsx:404` má stav natvrdo jako inline union
  `"draft" | "active" | "closed"` — přepsat na `RaceState`, jinak build spadne.

### Přehled (`overview-tab.tsx:60`)

Dnes tři větve podle stavu. Nově čtyři + dvě tlačítka:
- v `draft`: **„Připravit ke spuštění"** (dialog: „vydají se PINy a QR kódy")
- v `ready`: **„Spustit závod"** + sekundární **„Zpět do přípravy"**
  (dialog musí říct „vytištěné QR kódy zůstávají v platnosti", jinak si to
  organizátor netroufne kliknout)
- v `active`: **„Uzavřít závod"** dostane potvrzovací dialog s výčtem
  důsledků — uzavření je **nevratné** (žádný přechod `closed → active`
  neexistuje), zastaví zápis ze stanovišť (neodeslané offline zápisy
  skončí jako `blocked`, viz offline R3), spustí 12h okno zpětné vazby
  a jedinou cestou k úpravě bodů se stává záložka „Opravy".

### Hlídky (`patrols-tab.tsx:50`)

`canModify` se rozpadá na `canAdd` (jen `draft`) a `canEdit`
(`draft | ready`). V `ready` formulář ukáže `start_number` a kategorii
jako read-only s vysvětlivkou. Hlášky na řádcích 116 a 130 přepsat —
dnes předpokládají, že „ne-draft" znamená spuštěno nebo uzavřeno.
Přibude akce **„Stáhnout ze závodu"** (`ready` + `active`) a u stažených
**„Vrátit do závodu"**.

Mazání hlídky v `draft` u závodu s nastaveným `prepared_at`: potvrzovací
dialog varuje, že vytištěná QR karta hlídky (feedback PIN) přestane platit
— znovuzaložení dostane nový PIN, `:missing_only` chrání jen existující
záznamy (viz sekce 1). Totéž platí pro mazání stanoviště ve `stations-tab`.

### Stanoviště (`stations-tab.tsx`)

- `canModify` → `draft | ready` (přidávání/mazání zůstává jen `draft`).
- **Tisk QR se odemyká už v `ready`** — dnes je `disabled` pro `draft`
  (řádky 506–528) a jinak povolený, takže stačí vyměnit podmínku
  za `raceState === "draft"` → `raceState === "draft" || raceState === "closed"`.
- `resetPin` disabled dnes při `state !== "active"` (řádek 169) → povolit
  i v `ready`.

### Nastavení (`settings-tab.tsx:191`)

`readOnly = race.state !== "draft"` — v `ready` by tak zamklo i nastavení
zpětné vazby, které dává smysl ladit až s vytištěnými QR. Návrh: rozdělit
na `structuralReadOnly` (`!== "draft"`: `scoring_model`, `time_tracking`)
a `settingsReadOnly` (`active`/`closed`: název, místo, `feedback_*`,
`public_code`). Hláška na řádku 278 ať jmenuje stav česky, ne `{race.state}`.

### Obrazovka „závod ještě nebyl spuštěn"

Sdílená komponenta pro `/station/[stationId]` i `/feedback/[patrolId]`:
- název závodu, název stanoviště / hlídky, ať je jasné, že QR je správný;
- text „Závod ještě nebyl spuštěn. Jakmile organizátor závod spustí,
  stránka se otevře sama.";
- **polling `refetchInterval: 30_000`**, plus refetch na `visibilitychange`
  (telefon v kapse s uspaným tabem);
- vizualizace čekání: jemný pulsující indikátor + „naposledy ověřeno 7:52:10"
  a tlačítko „Zkusit hned";
- **žádný odpočet** — závod nemá pevný čas startu, takže `held_on`
  ukazovat jen jako datum, ne jako čas do startu;
- po úspěchu přechod bez nutnosti refreshe.

Offline poznámka: tahle obrazovka je jediný stav, kdy má polling smysl
i při zapnuté offline vrstvě — `networkMode: "offlineFirst"` tu nechceme,
v offline režimu ať rovnou hlásí „bez připojení" místo nekonečného čekání.

---

## 5. Pořadí prací

| # | Krok |
|---|---|
| 1 | Migrace `00X` (stav + `prepared_at` + `withdrawn*`) |
| 2 | `issue_tokens_for/3` s `:missing_only` \| `:rotate` — **první, je to základ ostatního** |
| 3 | `prepare_race` / `unprepare_race`, úprava `activate_race`, routy |
| 4 | Rozpad guardů + filtr polí u `update_patrol` |
| 5 | `get_station_for_login` + `race_not_started` v login endpointu a plugu |
| 6 | `withdraw_patrol` / `restore_patrol` + vynechání v `leaderboard/1` |
| 7 | FE: typy, pill, přechody v přehledu |
| 8 | FE: hlídky (edit vs. add, stažení), stanoviště (tisk v `ready`), nastavení |
| 9 | FE: obrazovka „nebyl spuštěn" + polling |

## 6. Testy

- `draft → active` napřímo vrací 409 `race_not_ready`
- `prepare` vydá PINy; **druhé** `prepare` po `unprepare` je nezmění
- `unprepare` nastaví `is_active = false`; následný `prepare` ho vrátí, PINy beze změny
- `reissue_station_tokens` PINy naopak změní
- `create_patrol` v `ready` → 409; `update_patrol` názvu v `ready` → 200
- `update_patrol` se `start_number` v `ready` → 409 `field_locked`
- `update_station` s `criteria` v `ready` → 200
- station login v `ready` → 409 `race_not_started` (ne 401)
- platný station token ve stavu `ready` → plug odmítne
- stažená hlídka zmizí z `leaderboard/1`, ale její `score_entry` zůstanou
- `list_active_races_public` závod v `ready` nevrací
