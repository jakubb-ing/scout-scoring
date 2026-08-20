# AGENTS.md — Scout Scoring

Bodovací systém pro skautské závody hlídek. Organizátor si nachystá závod,
rozhodčí na stanovištích zapisují body z mobilu, výsledky se počítají živě.

Tenhle soubor je kanonický vstupní bod pro AI agenty. `CLAUDE.md` v rootu
řeší **jen** routování nástrojů (context-mode) — o projektu nic neříká.

---

## 1. Stack a struktura

```
scout-scoring/
├── apps/
│   ├── api/     Elixir 1.19+ / OTP 28+, Phoenix 1.7 (jen JSON API, žádné LiveView)
│   └── web/     Next.js 15 App Router, React 19, Tailwind + shadcn/ui, TanStack Query v5
├── docs/        plány (viz plan.md) — žádný z nich zatím není implementovaný
├── Makefile     všechny dev příkazy
├── VERSION      0.1.0
└── CHANGELOG.md Keep a Changelog + SemVer
```

**Databáze je SurrealDB 3.x**, ne Postgres a **není tu Ecto**. Veškerý
přístup jde přes `Api.SurrealDB` (`apps/api/lib/api/surreal_db.ex`) —
tenký HTTP klient nad `/rpc`. Schéma se udržuje ručně v
`apps/api/priv/surreal/migrations/*.surql` a aplikuje `make api-migrate`.

Nasazení: fly.io (`apps/api/fly.toml`). DB běží jako samostatná instance.

## 2. Příkazy

```bash
make db-local      # SurrealDB na :8000 (root/root, RocksDB v /tmp)
make api-setup     # mix deps.get && mix compile
make api-migrate   # vytvoří NS scout / DB scoring + aplikuje schéma (idempotentní)
make api-seed      # první organizátor; SEED_EMAIL, SEED_PASS, SEED_NAME
make api-server    # Phoenix na :4000
make api-test      # mix test

cd apps/web && npm run dev        # Next na :3000
cd apps/web && npm run typecheck  # tsc --noEmit
```

**`npm run build` v `apps/web` nespouštěj**, pokud o to nikdo výslovně
nepožádá — přepíše uživateli běžící dev build a musí restartovat.
Na ověření FE změn používej `npm run typecheck`.

## 3. Co je potřeba vědět, než začneš psát kód

### SurrealDB má ostré hrany

- **Auto-coercion stringů.** SurrealDB 3 překlopí string ve tvaru
  `"table:id"` na record referenci. Pole, kde tohle nechceš (např.
  `audit_log.actor` = `"organizer:abc"`), musí jít přes
  `type::string($var)` — viz `Api.AuditLog.log/5`.
- **`build_set/1`** (`surreal_db.ex:104`) staví `SET` fragment a zahazuje
  `nil` hodnoty. Používej ho, neskládej SQL ručně.
- **`DEFINE FIELD IF NOT EXISTS` nepřepíše existující ASSERT.** Když měníš
  omezení už existujícího pole, musí to být `DEFINE FIELD OVERWRITE`.
- Migrace jsou **dopředu jen přidávající**; rollback neexistuje.

### Dvě oddělené autentizace

| kdo | jak | kde |
|---|---|---|
| organizátor | JWT (Guardian), invite-only | plug `AuthenticateOrganizer`, `conn.assigns.organizer` |
| stanoviště | `Phoenix.Token` z `station_id` + PIN, TTL 72 h | plug `AuthenticateStation`, `conn.assigns.station` |

Ve FE žijí oba tokeny odděleně v localStorage (`ss.organizer_token`,
`ss.station_token`) a `apiFetch(path, { scope })` vybírá ten správný.
**Nikdy je nemíchej** — stanoviště nesmí vidět organizátorská data.

Nad organizátorem je ještě per-závod role: `race.owner`, nebo
`race_member.role ∈ {"read", "edit"}`. Guardy jsou v `races.ex`
(`ensure_race_edit/2`, `ensure_race_draft_edit/2`) — autorizaci řeš tam,
ne v controlleru, ať ji nejde obejít jiným endpointem.

### Stav závodu řídí skoro všechno

`draft → active → closed`. V `draft` se edituje struktura, `activate_race/2`
vydá PINy stanovišť, `close_race/2` stanoviště deaktivuje a zamkne zápis
bodů. Stav se kontroluje na ~15 místech v API a ~12 ve FE — když ho měníš,
projdi obojí. (`docs/race-ready-state-plan.md` navrhuje přidat stav `ready`.)

### Audit log

`Api.AuditLog` je append-only a **nikde se z něj nemaže**. Každá mutace
bodů do něj ukládá `before` i `after`. Když přidáváš mutaci, přidej i log —
je to jediná zpětná dohledatelnost, kterou systém má.

### Invariant bodování

Jeden `score_entry` na dvojici (stanoviště, hlídka), vynucené UNIQUE
indexem. Opakovaný zápis přepisuje → **zápis je idempotentní**, což je
předpoklad pro plánovanou offline frontu. Nerozbíjej to.

## 4. Konvence

- **Jazyk:** veškerý text pro uživatele je **česky**. Kód, komentáře,
  názvy proměnných a commity anglicky.
- **Commity:** konvenční prefix (`feat:`, `fix:`, `refactor:`, `docs:`).
  Chystá se release-please, který podle nich generuje CHANGELOG.
- **Větve:** práce na feature větvi, do `main` přes PR. Necommituj
  a nepushuj, dokud o to uživatel nepožádá.
- **FE:** komponenty v `components/organizer` (dashboard),
  `components/station` (rozhodčí), `components/ui` (shadcn primitiva).
  API volání v `lib/api/*`, React Query hooky v `lib/queries/*`,
  query keys centrálně v `lib/queries/keys.ts`.
- **Barvy:** scout paleta přes Tailwind tokeny (`scout-blue` #336CAA,
  `scout-yellow` #FCC11E, `scout-text-muted`, …). Nepiš hex do komponent.
- **Mobile-first.** Rozhodčí i doprovod jsou na telefonu venku, často se
  slabým signálem. Dotykové cíle dost velké, žádné hover-only interakce.

## 5. Stav testů — čti pozorně

V `apps/api/test` je dnes **jediný testovací soubor** (`error_json_test.exs`).
Doména, autorizace ani stav závodu testy pokryté **nejsou**. FE testy
neexistují vůbec.

Prakticky to znamená: `make api-test` že projde **není** důkaz, že jsi nic
nerozbil. U změn v `races.ex`, `scoring.ex` nebo v plugách ověřuj chování
ručně přes API, nebo napiš test — `test/support/conn_case.ex` je připravený.

## 6. Dokumentace

Po větší změně chování, API, rout nebo workflow aktualizuj ve stejném
kroku `CHANGELOG.md` (sekce `[Unreleased]`) a dotčené README
(root, `apps/web/README.md`).

`docs/plan.md` je rozcestník rozpracovaných plánů s doporučeným pořadím
implementace. **Plány popisují budoucí stav, ne současný** — nečti je jako
dokumentaci toho, co appka umí dnes.

## 7. Scratch soubory

Dočasné soubory patří do OS temp (`mktemp -d`), ne do repa.
Trvalé výstupy (plány, specifikace) do `docs/`.
