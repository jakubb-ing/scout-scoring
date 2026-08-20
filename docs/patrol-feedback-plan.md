# Zpětná vazba od doprovodu hlídky — plán

Mobile-first offline stránka, kde doprovod hlídky napíše slovní hodnocení.
Staví na offline vrstvě z `offline-station-plan.md` (**ta se dělá první**).

Rozhodnuto s zadavatelem:
- Textarey **bez kontextu** — jen "pozitivní" / "prostor pro zlepšení", žádné popisky per položka.
- Zveřejnění ve výsledcích je **přepínač v nastavení závodu**, default vypnuto.
- Jeden QR = jedna hlídka, souběh zařízení řeší **lock s možností převzetí**.
- Formulář je otevřený do **`race.closed_at + 12 h`**.
- Admin může odemknout **libovolně-krát**, doprovod vidí původní text.
- Log bod 4 = **znovu-odevzdání**, ne autosave.
- PIN/QR pro hlídky se generují **při přechodu do stavu `ready`** (`prepare_race`).
- Odeslat lze i s prázdnými poli, ale **s upozorněním** v potvrzovacím dialogu.

---

## 1. Datový model (migrace 007)

### Nastavení na `race`

```sql
DEFINE FIELD IF NOT EXISTS feedback_enabled ON race TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS feedback_positive_count ON race TYPE int
  ASSERT $value >= 0 AND $value <= 10 DEFAULT 3;
DEFINE FIELD IF NOT EXISTS feedback_negative_count ON race TYPE int
  ASSERT $value >= 0 AND $value <= 10 DEFAULT 3;
DEFINE FIELD IF NOT EXISTS feedback_public ON race TYPE bool DEFAULT false;
```

`feedback_public = true` → slovní hodnocení se ukáže i na výsledkovce
chráněné `public_code`. Default `false` = jen organizátoři (owner/edit).

### Auth na `patrol` — stejný vzor jako stanoviště

```sql
DEFINE FIELD IF NOT EXISTS feedback_pin ON patrol TYPE option<string>;
DEFINE FIELD IF NOT EXISTS feedback_nonce ON patrol TYPE option<string>;
```

`feedback_nonce` slouží k invalidaci vydaných tokenů při resetu PINu —
stejně jako `station.token_nonce`.

**Kdy se PIN vydává:** při přechodu do stavu `ready`, tedy v
`Races.prepare_race/2` — viz `race-ready-state-plan.md`, který tenhle krok
zavádí a přesouvá do něj i vydávání tokenů stanovišť. V `draft` stavu
hlídky PIN nemají a QR karty se negenerují. Hlídka přidaná později
(přidávat jde jen v `draft`, viz `race-ready-state-plan.md`) PIN při
vytvoření **nedostane** — vydá jí ho až nejbližší průchod `prepare_race`
v režimu `:missing_only`; teprve pak jde vytisknout její karta.

Vydávání musí běžet v režimu **`:missing_only`** — opakovaný průchod
`draft → ready → draft → ready` nesmí přegenerovat PINy už vytištěných
karet. Detaily a odůvodnění v `race-ready-state-plan.md`, sekce 1.

> **Závislost:** tenhle plán předpokládá, že `race-ready-state-plan.md`
> je hotový dřív. Pokud by se feedback dělal první, PINy hlídek se vydají
> v `activate_race/2` a při zavádění stavu `ready` se přesunou.

### Nová tabulka `patrol_feedback`

```sql
DEFINE TABLE IF NOT EXISTS patrol_feedback SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS patrol ON patrol_feedback TYPE record<patrol>;
DEFINE FIELD IF NOT EXISTS race ON patrol_feedback TYPE record<race>;
-- positives/negatives: pole stringů, index = pořadí textarey
DEFINE FIELD IF NOT EXISTS positives ON patrol_feedback TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS negatives ON patrol_feedback TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS state ON patrol_feedback TYPE string
  ASSERT $value IN ["draft", "submitted"] DEFAULT "draft";
DEFINE FIELD IF NOT EXISTS submitted_at ON patrol_feedback TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS reopened_at ON patrol_feedback TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS reopened_by ON patrol_feedback TYPE option<string>;
DEFINE FIELD IF NOT EXISTS reopen_count ON patrol_feedback TYPE int DEFAULT 0;
-- lock
DEFINE FIELD IF NOT EXISTS lock_device ON patrol_feedback TYPE option<string>;
DEFINE FIELD IF NOT EXISTS lock_at ON patrol_feedback TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS created_at ON patrol_feedback TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON patrol_feedback TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS feedback_patrol_unique ON patrol_feedback FIELDS patrol UNIQUE;
DEFINE INDEX IF NOT EXISTS feedback_race ON patrol_feedback FIELDS race;
```

Jeden záznam na hlídku (UNIQUE), autosave = upsert → **idempotentní**,
stejně jako `score_entry`. Offline outbox tak nepotřebuje merge.

---

## 2. Lock — jednoduché řešení

Cíl: druhé zařízení nesmí tiše přepsat text prvního. Bez WebSocketů,
bez heartbeatu, funguje i offline-first.

1. Klient si při prvním otevření vygeneruje `device_id`
   (`crypto.randomUUID()`, uložený v `localStorage`, per prohlížeč).
   „Zařízení" je tedy fakticky *prohlížeč* — druhý sken QR v jiném
   prohlížeči téhož telefonu se projeví jako cizí zařízení. Hlášky proto
   říkají „jiné zařízení nebo prohlížeč", aby si to doprovod dokázal
   spojit a bez obav použil převzetí.
2. Každý autosave posílá `device_id`. Server:
   - `lock_device` je prázdný → nastaví ho na `device_id` (claim),
   - `lock_device == device_id` → uloží normálně,
   - `lock_device != device_id` → **HTTP 409** `{error: "locked_by_other_device", lock_at}`.
3. Klient na 409 přepne formulář do read-only s hláškou
   *„Formulář už vyplňuje jiné zařízení (od 14:32)"* a tlačítkem
   **„Převzít vyplňování"**.
4. Převzetí = `POST .../feedback/takeover` → přepíše `lock_device`.
   Původní zařízení dostane 409 při dalším autosave a spadne do stejného stavu.

Žádné TTL, žádný cron. Lock se čistí jen převzetím a při `submit`
(`lock_device = NONE`). Vědomé rozhodnutí: preferujeme, aby druhý člověk
musel udělat explicitní krok, před automatickým vypršením zámku.

**Offline dopad:** zařízení bez signálu se 409 dozví až při flushi outboxu.
Flusher pro tento `kind` musí 409 ukázat jako konflikt (nabídnout převzetí
nebo zkopírování textu), ne položku tiše zahodit jako ostatní 4xx.

---

## 3. Časové okno

Zápis je povolen, když platí obojí:

```elixir
race["feedback_enabled"] == true and
  (race["state"] != "closed" or now <= closed_at + 12h)
```

Po vypršení → `423 feedback_window_closed`. Guard `ensure_feedback_open/1`
v `Api.Feedback`, obdoba `Scoring.ensure_race_open/1`.
Ve FE zobrazit odpočet („zbývá 3 h 20 min").

**Reopen okno prodlužuje.** Odemkne-li admin záznam po vypršení okna,
byl by jinak reopen k ničemu — guard proto počítá
`max(closed_at, reopened_at) + 12 h` (per záznam, `reopened_at` z
`patrol_feedback`). Admin tak dává explicitním krokem hlídce dalších 12 h;
globální okno závodu se tím nemění.

---

## 4. API

### Veřejné / doprovod (nový plug `AuthenticatePatrolFeedback`)

```
POST /api/feedback/login          # {patrol_id, pin} -> {token, patrol, race, config}
GET  /api/feedback/me             # patrol + počty textarea + aktuální obsah + stav locku
PUT  /api/feedback/draft          # autosave: {positives[], negatives[], device_id}
POST /api/feedback/takeover       # {device_id}
POST /api/feedback/submit         # uzavře, zapíše submitted_at, uvolní lock
```

Token: `Api.Auth.FeedbackToken` (Phoenix.Token, salt `patrol-feedback/v1`,
payload `%{pid, rid, n}`), TTL 72 h jako u stanoviště. Rate-limit na
`/feedback/login` stejně jako `station_login`.

### Organizátor

```
POST /api/races/:race_id/patrols/:id/feedback_pin   # vydat / resetovat PIN
POST /api/patrol-feedback/:id/reopen                # odemknout k editaci
GET  /api/races/:race_id/feedback                   # přehled stavů pro dashboard
```

Reopen guard: `Races.ensure_race_edit/2`. **Admin nemá endpoint na přímou
editaci obsahu** — vědomě, aby slovní hodnocení zůstalo autentické.

Do `do_update_race/3` v `races.ex:91` přidat 4 nová `feedback_*` pole.
Do `DashboardController.results` a `PublicController.results` přidat
`patrol_feedback` — do veřejné odpovědi **jen když `race.feedback_public`**.

---

## 5. Audit log

Tabulka `audit_log` beze změn, jen nové akce. **Autosave se neloguje.**

| akce | kdy | payload |
|---|---|---|
| `feedback.started` | první autosave, kdy byl záznam prázdný | `%{patrol, device_id}` |
| `feedback.submitted` | submit | `%{patrol, positives, negatives, reopen_count}` |
| `feedback.reopened` | admin odemkne | `%{patrol, reason, positives, negatives}` — **snapshot obsahu před odemčením** |
| `feedback.resubmitted` | submit po reopen | `%{patrol, positives, negatives, reopen_count}` |
| `feedback.taken_over` | převzetí zařízení | `%{patrol, from_device, to_device}` |

`actor` = `"patrol:<id>"` u doprovodu, `"organizer:<id>"` u reopen.
Snapshot u `feedback.reopened` znamená, že každá verze textu před přepsáním
je dohledatelná — admin sice nemůže editovat, ale kdyby doprovod text po
odemčení smazal, původní znění zůstává v logu.

---

## 6. Frontend

### Nová route `/feedback/[patrolId]`

- QR nese `/feedback/{patrolId}?pin={pin}` — přesně jako
  `stations-tab.tsx:440` (`/station/{id}?pin={pin}`).
- Layout: hlavička s názvem hlídky + startovním číslem, indikátor
  online/offline/`N čeká` (sdílená komponenta z offline fáze 4),
  N textarea „Co se povedlo" + M „Prostor pro zlepšení", dole odpočet okna
  a tlačítko **„Uzavřít a odeslat"** s potvrzovacím dialogem
  („po odeslání už nepůjde upravovat").
- **Prázdná pole odeslání neblokují.** Pokud je některá textarea prázdná,
  dialog to navíc vypíše — *„2 pole zůstala nevyplněná (Co se povedlo #3,
  Prostor pro zlepšení #1). Opravdu odeslat?"* — a po potvrzení odešle
  i tak. Validace je tedy čistě FE upozornění, server prázdné hodnoty
  přijímá bez omezení.
- Autosave: debounce 5 s po posledním úhozu + na `blur` + na
  `visibilitychange` (zavření prohlížeče na mobilu je běžný způsob odchodu).
  Stavová hláška „Ukládám… / Uloženo v 14:32 / Uloženo offline".
- Po `submitted`: read-only přehled s časem odeslání.

### Offline zapojení

- `qk.feedbackMe` do allowlistu v `lib/offline/persisted-queries.ts`.
- Outbox `kind: "feedback.draft"`, `dedupeKey = patrolId` → čekající
  autosavy se skládají na sebe, odejde jen poslední.
- Outbox `kind: "feedback.submit"`, `dedupeKey = "submit:" + patrolId`.
  Oba kinds definují `chainKey = patrolId` (řetězení z offline plánu,
  fáze 3): položky téže hlídky odcházejí v pořadí vložení a **selhání
  `feedback.draft` — včetně 409 locku — blokuje `feedback.submit` téže
  hlídky**, dokud se konflikt nevyřeší převzetím nebo zahozením draftu.
  Sekvenční průchod podle `id` sám nestačí; po chybě flusher nesmí
  pokračovat na submit stejné hlídky.
- `start_url` v manifestu je `/station` — navigation fallback musí pokrýt
  i `/feedback/[patrolId]`.

### Dashboard — záložka Hlídky

- Tlačítko **„QR pro doprovod"** vedle stávajícího QR pro stanoviště,
  tisková karta: název hlídky, startovní číslo, kategorie, QR, PIN.
  Znovupoužít tiskový layout z `stations-tab.tsx` (vytáhnout `LoginCard`).
- Sloupec stavu: `—` / `rozepsáno` / `odevzdáno 15:42`, u odevzdaných
  akce **„Vrátit k editaci"** (dialog s důvodem → `reopen`).

### Nastavení závodu (`settings-tab.tsx`)

Sekce „Zpětná vazba od doprovodu": hlavní přepínač, dva steppery 0–10
(znovupoužít `number-stepper-input.tsx`), přepínač „Zobrazit ve veřejných
výsledcích". Při vypnutém hlavním přepínači zbytek disabled.

### Detail hlídky ve výsledcích

`app/dashboard/results/patrol/page.tsx` — nová sekce pod rozpadem bodů.
Vidí ji organizátor vždy; přes veřejný kód jen když `race.feedback_public`.
Když je stav `draft`, organizátorovi ukázat „rozepsáno, zatím neodevzdáno".

---

## 7. Pořadí prací

| # | Krok | Závislost |
|---|---|---|
| 0 | Offline vrstva, fáze 1–3 (`offline-station-plan.md`) | — |
| 1 | Migrace 007 + `Api.Feedback` + `FeedbackToken` + plug | — |
| 2 | Endpointy doprovodu + audit akce + testy | 1 |
| 3 | Endpointy organizátora (PIN, reopen, přehled) | 1 |
| 4 | Nastavení závodu ve FE + `feedback_*` v `do_update_race` | 3 |
| 5 | Route `/feedback/[patrolId]` + autosave + lock UI | 2 |
| 6 | Zapojení do outboxu | 0, 5 |
| 7 | QR karty + stav + reopen v záložce Hlídky | 3 |
| 8 | Sekce v detailu hlídky + `feedback_public` ve veřejné odpovědi | 4 |

## 8. Testy (API)

- autosave vytvoří záznam a zabere lock; druhé `device_id` dostane 409
- takeover přepíše lock, původní zařízení pak dostane 409
- submit uzavře → další `PUT draft` vrací 423
- reopen adminem → editace zas projde, `reopen_count` inkrementuje
- okno: `closed_at + 11 h` projde, `+ 13 h` vrací 423
- reopen po vypršení okna: editace projde do `reopened_at + 12 h`, pak 423
- `feedback_enabled = false` → login vrací 403
- submit s prázdnými poli projde (server nevaliduje neprázdnost)
- `prepare_race` vydá PIN všem hlídkám; hlídka v `draft` závodě PIN nemá
- opakované `prepare_race` PINy hlídek nemění (`:missing_only`)
- read-role člen nesmí volat reopen
- audit: `started` vznikne jen jednou, autosave nic neloguje
