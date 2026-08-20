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

   Běží na `http://127.0.0.1:4000`. `GET /api/health` vrací `{"status":"ok","db":"ok"}`.

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
