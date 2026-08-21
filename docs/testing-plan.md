# Plán testů

> **Stav:** implementováno. API má 217 testů (`mix test --include db`),
> web 19 testů outboxu (`npm test`). Web se záměrně nedotáhl dál —
> priorita byl backend; zbývající webové scénáře z tohoto plánu (CSV,
> okno, allowlist, detekce offline) jsou připravené k dopsání, moduly
> pro ně jsou vytažené do `lib/audit/csv.ts` a `lib/feedback/window.ts`.

Repo dnes nemá prakticky žádné testy — jediný soubor je generovaný
`error_json_test.exs` se dvěma testy na render chybové stránky. Přitom
v posledních pěti plánech přibyla logika, kde tichá chyba stojí data nebo
znehodnotí vytištěné materiály. Tenhle dokument říká, co testujeme, čím
a proč zrovna to.

## Rizikový profil — co musí být pokryté

Seřazeno podle toho, co se stane, když to selže:

| # | riziko | důsledek selhání | vrstva |
|---|---|---|---|
| R1 | outbox zahodí položku po 423 / 401 | **nenávratná ztráta hodnocení**, rozhodčí celou dobu viděl „uloženo" | web |
| R2 | `issue_tokens_for` přegeneruje PIN v `:missing_only` | zneplatní **vytištěné QR kódy**, pozná se až v terénu | api+db |
| R3 | pořadí `feedback.draft → submit` se rozpadne | odešle se prázdný submit, text je pryč | web |
| R4 | lock zpětné vazby pustí druhé zařízení | tiché přepsání textu doprovodu | api+db |
| R5 | opravy bodů projdou i v `active` | padá invarianta, na které stojí offline R2 (last-write-wins) | api+db |
| R6 | veřejná výsledkovka vydá důvod opravy / jméno | únik interní informace o lidech | api+db |
| R7 | okno zpětné vazby počítá špatně | formulář se zavře dřív nebo nikdy | api |
| R8 | `field_locked` pustí změnu startovního čísla v `ready` | rozpadne se pořadí a vytištěné karty | api |
| R9 | token stanoviště projde jako token doprovodu | cizí přístup k hodnocení | api |
| R10 | station login v `ready` vrátí 401 místo 409 | rozhodčí honí neexistující chybu PINu | api+db |

## Tři vrstvy

### 1. Čisté unit testy API (bez DB) — `mix test`

Běží vždy, nepotřebují nic spuštěného. Pokrývají R7, R8, R9 a validace.
Kde je logika dnes v `defp`, vytáhne se do veřejné funkce s dokumentací —
ne kvůli testu samotnému, ale protože jde o pravidla, která si zaslouží
jméno (`ensure_feedback_open/2`, `restrict_patrol_attrs/3`,
`validate_reason/1`).

### 2. Integrační testy API proti SurrealDB — `mix test --include db`

Tagované `@moduletag :db`, **ve výchozím běhu vyloučené**, aby `mix test`
fungoval i bez databáze. Harness (`Api.DBCase`) přepne konfiguraci na
vlastní databázi s náhodným jménem, pustí migrace a po testu ji zahodí —
izolace je per test modul, ne per test, protože SurrealDB nemá obdobu
Ecto SQL sandboxu.

Pokrývají R2, R4, R5, R6, R10 a celý průchod stavy závodu.

### 3. Unit testy webu — `npm test` (vitest) — *částečně hotové*

Outbox je nejrizikovější kus FE kódu a stojí na Dexie/IndexedDB, takže se
testuje **proti reálnému Dexie nad `fake-indexeddb`**, ne proti mocku —
mock by potvrdil jen to, že mock funguje. Síťová vrstva se mockuje
(`vi.mock` nad `lib/api/*`), aby šlo vyrobit 423, 401, 409 i 5xx.

Pokrývají R1 a R3.

Komponenty (React) v tomhle kole netestujeme. Chyby v nich jsou vidět
a nestojí data; přednost má logika, kde se selhání projeví tiše.

## Konkrétní scénáře

### Vrstva 1 — čisté

- **Tokeny:** roundtrip sign/verify, expirace, poškozený token, a hlavně
  že station token **neprojde** jako feedback token a naopak (R9).
- **Formáty:** PIN je 6 číslic včetně vedoucích nul, veřejný kód nikdy
  neobsahuje 0/O/1/I/L (čte se do telefonu), nonce je unikátní.
- **`build_set/1`:** `nil` hodnoty vypadnou, klauzule i vars sedí.
- **Okno zpětné vazby (R7):** matice stavů — `active` vždy otevřeno,
  `draft`/`ready` zavřeno, `closed` do +12 h, po +13 h zavřeno, reopen
  okno prodlužuje z `reopened_at`, vypnutý feedback přebíjí vše.
- **Zámek polí hlídky (R8):** v `draft` projde vše; v `ready` projde
  název a členové, změna `start_number` nebo kategorie je `:field_locked`,
  a nezměněné hodnoty se propíší z původního záznamu.
- **Důvod opravy:** prázdný, `nil` i dvouznakový je `:reason_required`.

### Vrstva 2 — DB

- `draft → active` napřímo = `:race_not_ready`.
- `prepare` vydá PINy; **druhý** `prepare` po `unprepare` je nezmění (R2);
  `reissue_station_tokens` je naopak změní.
- `unprepare` shodí `is_active`, `prepare` ho vrátí.
- `create_patrol` v `ready` = 409; `update_patrol` názvu projde;
  se `start_number` je `:field_locked`.
- `update_station` s kritérii v `ready` projde.
- station login: `ready` → `{:race_not_started, _}`, špatný PIN v `active`
  → `:invalid_pin`, `closed` → `:race_closed` (R10).
- stažená hlídka zmizí z `leaderboard/1` i z `list_patrols_public/1`,
  ale její `score_entry` v DB zůstanou.
- feedback: autosave zabere lock, druhé `device_id` dostane
  `:locked_by_other_device`, takeover ho přepíše, submit lock uvolní,
  reopen inkrementuje `reopen_count` a uloží snapshot do audit logu (R4).
- opravy: v `active` `:race_not_closed` (R5 — tenhle test hlídá invariantu
  offline R2), v `closed` projde, zapíše `corrected_at` a `score.correct`
  s `before_total`/`after_total`.
- veřejný výpis zápisů neobsahuje `correction_reason` ani `corrected_by`
  (R6).
- audit log: filtr podle akce, `limit`/`offset` stránkování, clamp mimo
  rozsah.

### Vrstva 3 — web

- **Outbox dedupe:** dvakrát zapsaná stejná hlídka = jedna položka
  s posledními hodnotami.
- **Klasifikace chyb (R1):** 423 → `blocked`, 401 → `blocked_auth`,
  jiné 4xx → zahodit a nahlásit, 5xx a síť → zůstat `pending`.
- **Řetězení (R3):** selhání draftu blokuje submit téže hlídky, ale
  položku jiné hlídky nechá projít.
- **Zotavení:** `resumeAuthBlocked` vrátí položky do fronty a flush je
  odešle; `clearOutbox` maže jen svůj prefix.
- **Optimistický update:** `onApplied` zapíše pending zápis do cache,
  `onFlushed` ho nahradí serverovou odpovědí.
- **Detekce offline:** `online`/`offline` eventy i selhaný request.
- **Allowlist persistence:** station a feedback klíče ano, dashboard ne.
- **CSV export:** escapování uvozovek a čárek, BOM, hlavička.
- **Zbývající čas okna:** shodné pravidlo jako na backendu.

## Co pouštět

```
make test          # vše, co nepotřebuje DB (api + web)
make test-api      # mix test
make test-db       # mix test --include db (potřebuje běžící SurrealDB)
make test-web      # vitest run
```

CI (`.github/workflows/test.yml`) pouští vrstvu 1 a 3 na každý PR,
vrstvu 2 se službou SurrealDB.

## Co testy odhalily

Testy nejsou jen pojistka do budoucna — při psaní našly šest chyb, které
byly v kódu už nasazené:

| # | chyba | důsledek |
|---|---|---|
| 1 | `withdraw_patrol` s prázdným důvodem posílal do SurrealDB `NULL` | stažení hlídky bez důvodu vždy selhalo — a přesně tak to volá FE |
| 2 | `lock_device` po `NONE` mizí ze záznamu, pattern match na klíč nesedl | po odemčení adminem doprovod dostal chybu serveru místo formuláře |
| 3 | `get_station_for_login` filtroval `is_active` | v `draft` i po uzavření se hlásil „špatný PIN" místo stavu závodu |
| 4 | plug vracel po uzavření závodu 401 místo 423 | offline fronta by hlásila „přihlas se znovu" tam, kde přihlášení nepomůže |
| 5 | actor se v nových cestách prefixoval dvakrát (`organizer:organizer:…`) | rozbitá hodnota v audit logu |
| 6 | `delete_entry` cpal do payloadu `{:ok, …}` tuple | funkce spadla na Jason.Encoder pokaždé |

Bonusem je změna v outboxu: souběžná volání `flushOutbox` se místo
přeskočení slučují do jednoho průchodu, takže volající dostane skutečný
výsledek, ne prázdno.
