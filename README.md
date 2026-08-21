# scout-scoring

Monorepo pro aplikaci Scout Scoring (viz `docs/plan.md`).

Aktuální projektová verze je v `VERSION`; změny mezi verzemi se zapisují do
`CHANGELOG.md`.

```
scout-scoring/
├── apps/
│   ├── api/       # Elixir + Phoenix REST API (this)
│   └── web/       # Next.js frontend pro organizátora a rozhodčí
└── docs/spec.md
```

## Dev setup

Prerekvizita: Elixir 1.19+, Erlang/OTP 28+, SurrealDB 3.x CLI.

1. **Spusť SurrealDB** (v samostatném terminálu):

   ```
   make db-local
   ```

   Data jsou v `/tmp/scout-surreal/`. HTTP API na `http://127.0.0.1:8000`, root/root.
   Na produkci DB poběží jako samostatná instance (fly.io apod.) — nakonfiguruj
   `SURREAL_URL`, `SURREAL_NS`, `SURREAL_DB`, `SURREAL_USER`, `SURREAL_PASS`.

2. **Nainstaluj deps + aplikuj schéma** (jednorázově):

   ```
   make api-setup
   make api-migrate
   ```

   Schéma je idempotentní (`DEFINE … IF NOT EXISTS`), migrace vytvoří namespace
   `scout` + databázi `scoring`, pokud chybí.

3. **Vytvoř prvního organizátora**:

   ```
   SEED_EMAIL=admin@scout.test SEED_PASS=testpass123 SEED_NAME="Admin" make api-seed
   ```

4. **Spusť API**:

   ```
   make api-server
   ```

   Běží na `http://127.0.0.1:8080` (port z `PORT`, default v `config/dev.exs`).
   `GET /api/health` vrací `{"status":"ok","db":"ok","version":"0.1.0"}`.

5. **Spusť frontend** (třetí terminál):

   ```
   make web-setup   # jednorázově: npm install + .env z .env.example
   make web-dev
   ```

   Běží na `http://127.0.0.1:3000`, API si bere z `NEXT_PUBLIC_API_URL`
   v `apps/web/.env`. Organizátor se přihlásí na `/login` údaji ze seedu,
   rozhodčí jdou na `/station`.

   Offline režim (service worker) je v dev buildu vypnutý — ověřuje se
   na `make web-build && cd apps/web && npm start`.

### Zkráceně

Tři terminály: `make db-local`, `make api-server`, `make web-dev`.
Poprvé navíc `make setup && make api-migrate && make api-seed`.

## Nasazení a migrace

Schéma mění **`release_command` z `apps/api/fly.toml`**:

```
release_command = "/app/bin/api eval 'Api.DB.Migrate.run()'"
```

Fly ho pustí po buildu nové image, na jednom dočasném stroji, **před**
spuštěním nové verze. Když migrace selže, deploy se zastaví a dál běží
stará verze. Aplikované migrace jsou v tabulce `_migration`, opakovaný
běh je no-op, takže je jedno, kolikrát se deploy zopakuje.

Migrace se proto **nepouštějí při startu aplikace** (`run_migrations_on_start:
false` v `config/prod.exs`) — dva souběžně startující stroje by si navzájem
shodily zápis do `_migration`, který má na názvu UNIQUE index.

Ruční spuštění, kdyby bylo potřeba:

```
fly ssh console -C "/app/bin/api eval 'Api.DB.Migrate.run()'"
```

Seed prvního organizátora se na produkci taky nespouští automaticky —
bez `SEED_*` proměnných by založil účet se známým heslem. Jednorázově:

```
fly ssh console -C "/app/bin/api eval 'Api.DB.Seed.run()'"
```

### Pořadí při změně schématu

Migrace jsou aditivní (`DEFINE … IF NOT EXISTS`, u změny asserce
`OVERWRITE`), takže nová verze API vidí nové sloupce a stará je ignoruje.
Frontend se nasazuje zvlášť — pokud nová funkce potřebuje nové API,
nasaď nejdřív backend.

## Proměnné prostředí

API je čte přes Dotenvy z `apps/api/.env` (shell má přednost), web z
`apps/web/.env` — a protože `NEXT_PUBLIC_*` se zapékají do buildu, musí
být nastavené **v době buildu**, ne až za běhu.

### API (`apps/api/.env`)

| proměnná | lokálně | produkce | k čemu |
|---|---|---|---|
| `SURREAL_URL` | `http://127.0.0.1:8000` | adresa instance | připojení k DB |
| `SURREAL_NS` / `SURREAL_DB` | `scout` / `scoring` | totéž | namespace a databáze |
| `SURREAL_USER` / `SURREAL_PASS` | `root` / `root` | **vlastní údaje** | přihlášení k DB |
| `PORT` | `8080` | `8080` (fly.toml) | port HTTP serveru |
| `PHX_HOST` | nepovinné | doména API | generování URL |
| `PHX_SERVER` | — | `true` | v release musí zapnout server |
| `SECRET_KEY_BASE` | nepovinné | **povinné** | podpis cookies; `mix phx.gen.secret` |
| `GUARDIAN_SECRET` | nepovinné (dev default) | **povinné** | podpis JWT organizátorů |
| `STATION_TOKEN_SECRET` | nepovinné (dev default) | **povinné** | podpis tokenů stanovišť i doprovodu |
| `OPENAI_API_KEY` | jen pro AI import | jen pro AI import | bez něj AI import spadne, zbytek appky běží |
| `OPENAI_MODEL` | nepovinné | nepovinné | default `gpt-5-mini` |
| `DNS_CLUSTER_QUERY` | — | nepovinné | clustering na fly.io |
| `SEED_EMAIL` / `SEED_PASS` / `SEED_NAME` | pro `make api-seed` | jednorázově | první organizátor |

Bez `GUARDIAN_SECRET` a `STATION_TOKEN_SECRET` produkční start **záměrně
spadne** — jinak by se tiše použily dev defaulty a kdokoli by si mohl
podepsat vlastní token.

### Web (`apps/web/.env`)

| proměnná | lokálně | produkce | k čemu |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8080` | veřejná URL API | kam míří requesty z prohlížeče |
| `NEXT_PUBLIC_BUILD_SHA` | nepovinné | doporučené | git hash v patičce; u PWA odliší starou cache od neproběhlého nasazení |

`NEXT_PUBLIC_APP_VERSION` nastavovat netřeba — `next.config.ts` ji bere
z `package.json`.

## Testy

```
make test          # vše, co nepotřebuje databázi (API + web)
make test-db       # API testy proti běžící SurrealDB (make db-local)
make test-web      # jen vitest
```

DB testy jsou tagované `:db` a ve výchozím běhu vyloučené, takže
`make test` projde i bez spuštěné databáze. Podrobnosti v
`docs/testing-plan.md`.

## Verzování a changelog

Verze posouvá **release-please** (GitHub Action): čte konvenční commity na
`main`, otevírá „Release PR" s bumpem verze a CHANGELOGem; merge PR = tag +
GitHub Release. Přes `extra-files` drží v souladu root `VERSION`,
`apps/api/mix.exs` i `apps/web/package.json` — tři místa, jeden vlastník.

- **Konvence commitů (a názvů PR — squash-merge!):** `feat:` → MINOR,
  `fix:` → PATCH, `feat!:` / `BREAKING CHANGE:` → MAJOR. Commity bez prefixu
  se do CHANGELOGu nedostanou. Názvy PR hlídá workflow `pr-title.yml`.
- Migrace schématu je vždy minimálně MINOR bump.
- `make version-show` vypíše verze ze všech tří míst vedle sebe.
- Verze je vidět v patičce FE (`AppVersion`) a v `GET /api/health`.

## Auth

- **Organizátor:** JWT v `Authorization: Bearer <token>`. Získání: `POST /api/auth/login`.
- **Stanoviště:** podepsaný krátkodobý token (Phoenix.Token + raw access token
  bcrypt-hashed v DB). Vygeneruje se při `POST /api/races/:id/activate`. Poslat
  v `Authorization: Bearer <token>` nebo `?token=…` pro QR landing.

## Endpointy (přehled)

| Metoda | Cesta | Scope |
|---|---|---|
| `POST` | `/api/auth/login` | public |
| `GET` | `/api/auth/me` | organizer |
| `POST` | `/api/auth/invite` | organizer |
| `GET/POST` | `/api/races` | organizer |
| `GET/PUT` | `/api/races/:id` | organizer |
| `POST` | `/api/races/:id/activate` | organizer |
| `POST` | `/api/races/:id/close` | organizer |
| `GET/POST` | `/api/races/:race_id/categories` | organizer |
| `GET/POST` | `/api/races/:race_id/patrols` | organizer |
| `POST` | `/api/races/:race_id/patrols/bulk` | organizer |
| `PUT/DELETE` | `/api/patrols/:id` | organizer |
| `GET/POST` | `/api/races/:race_id/stations` | organizer |
| `POST` | `/api/races/:race_id/stations/bulk` | organizer |
| `POST` | `/api/races/:race_id/ai-import/extract` | organizer |
| `POST` | `/api/races/:race_id/ai-import/refine` | organizer |
| `PUT` | `/api/stations/:id` | organizer |
| `POST` | `/api/stations/:id/deactivate` | organizer |
| `GET` | `/api/races/:race_id/dashboard` | organizer |
| `GET` | `/api/races/:race_id/leaderboard` | organizer |
| `GET` | `/api/races/:race_id/results` | organizer |
| `GET` | `/api/races/:race_id/audit` | organizer |
| `GET` | `/api/station/me` | station |
| `GET` | `/api/station/scores` | station |
| `POST` | `/api/station/scores` | station |

## Frontend trasy

| Trasa | Pro koho | Co dělá |
|---|---|---|
| `/` | public | landing + vstup do dashboardu |
| `/login` | organizátor | přihlášení organizátora |
| `/dashboard` | organizátor | správa závodu: Přehled, Hlídky, Stanoviště, Nastavení |
| `/dashboard/results?raceId=:id` | organizátor | výsledkové tabulky po kategoriích pro uzavřený závod |
| `/dashboard/results/patrol?raceId=:id&patrolId=:id` | organizátor | detail bodů jedné hlídky po stanovištích a podúkolech |
| `/station` | rozhodčí | výběr závodu a aktivního stanoviště |
| `/station/:stationId?pin=...` | rozhodčí | zadávání bodů na stanovišti |

## Dashboard a výsledky

Organizátorský dashboard používá `GET /api/races/:race_id/dashboard`.
Payload obsahuje agregace po hlídkách a stanovištích plus `activity` — jeden
řádek za každý záznam skóre (`score_entry`). Live aktivita proto ukazuje
konkrétní průchod hlídky stanovištěm: stanoviště, hlídku, body a čas poslední
aktualizace. Frontend polluje dashboard přibližně každých 10 s.

Dashboard má čtyři hlavní taby: Přehled, Hlídky, Stanoviště a Nastavení. Na
mobilu a tabletu se výběr závodu, nastavení, uživatelé a odhlášení přesouvají
do hamburger menu. Tab navigace se na mobilu přepne na ikonové záložky bez
horizontálního nebo vertikálního scrollu; aktivní záložka je zvýrazněná spodním
žlutým borderem.

Po uzavření závodu je v přehledu dostupné tlačítko **Zobrazit výsledky**.
Výsledková stránka používá `GET /api/races/:race_id/leaderboard` a zobrazuje
tabulku pro každou kategorii se sloupci pořadí, hlídka, body a rozdíl oproti
předchozí hlídce. Kliknutí na hlídku otevře detail, který používá
`GET /api/races/:race_id/results` a vypíše body hlídky po jednotlivých
stanovištích. Řádek stanoviště lze rozbalit na podúkoly/kritéria a jejich body.

Výsledková stránka má tlačítko **Export**, které otevře tiskový dialog pro A4
souhrn výsledků. Tisková verze obsahuje QR kód na aktuální online stránku
výsledků.

## AI import stanovišť

Organizátor v UI klikne na **„AI import"** u stanovišť, nahraje PDF / TXT (max
5 MB), AI vrátí draft stanovišť + seznam doplňujících otázek. Po jejich
zodpovězení se spočítá finální seznam, který se uloží přes
`/api/races/:race_id/stations/bulk`. Konverzace nemá žádný server-side state —
uživatelské zavření dialogu znamená restart.

Konfigurace:
- `OPENAI_API_KEY` — povinné. Bez něj endpoint vrací 502.
- `OPENAI_MODEL` — volitelné, default `gpt-5-mini`. Používá se Responses API
  se structured outputs (`text.format = json_schema`, `strict: true`).
- Při neplatném formátu odpovědi BE jednou retryne s chybovou nápovědou; po
  druhém selhání vrací `422 ai_invalid_format`.

## Známé vtípky SurrealDB 3.x

- `/sql` endpoint nepodporuje parametry v těle → používáme `/rpc` (`method=query`).
- Schemafull pole typu `option<T>` padá na `null` hodnotě přes RPC. Řešíme
  helperem `Api.SurrealDB.build_set/1`, který nil hodnoty z query vypouští.
- SurrealDB auto-coerce stringu tvaru `"table:id"` na record reference i pro
  pole typované jako `string`. Řeší obalení `type::string($var)`.
- `DEFINE FIELD OVERWRITE` je použité u `audit_log.payload` (flexible), aby
  akceptovalo libovolný payload bez předdefinovaných sub-polí.
