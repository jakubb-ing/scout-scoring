# Scout Scoring — Web (Next.js)

Minimalistický frontend pro Scout Scoring. Next.js 15 (App Router) + Tailwind + shadcn/ui,
s podporou dark/light módu a scout paletou (#336CAA / #FCC11E).

Dvě hlavní obrazovky:

| Trasa | Pro koho | Co dělá |
|---|---|---|
| `/dashboard` | organizátor | správa + průběžný přehled dokončení (taby: Přehled, Live aktivita, Hlídky, Stanoviště, Nastavení) |
| `/station/[stationId]?pin=…` | rozhodčí na stanovišti | výběr hlídky → dynamický formulář kritérií → submit |

Plus `/` (landing) a `/login` (organizátor; JWT, invite-only).

## Vývoj

```bash
cp .env.example .env.local        # NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
npm install
npm run dev                       # http://localhost:3000
```

Backend je `apps/api` (Elixir/Phoenix). Nastart:

```bash
cd ../.. && make api-server
```

## Struktura

```
app/
  layout.tsx                 # theme provider + Toaster + fonts
  page.tsx                   # landing
  login/page.tsx
  dashboard/page.tsx         # organizer — hlavní tabová navigace
  station/[stationId]/page.tsx

components/
  app-shell.tsx              # horní lišta se selectorem závodu + účet
  theme-provider.tsx / theme-toggle.tsx
  ui/                        # shadcn komponenty (Button, Card, Tabs, Dialog, …)
  organizer/                 # tab-specific komponenty
  station/                   # judge-flow komponenty

lib/
  utils.ts                   # cn(), datum/čas helpery
  api/
    client.ts                # fetch wrapper + token storage (organizer / station scope)
    types.ts                 # typy odpovědí backendu
    auth.ts | races.ts | patrols.ts | stations.ts | categories.ts | dashboard.ts | station.ts
```

## Autentizace

* **Organizátor** — `POST /api/auth/login` → JWT do `localStorage` (`ss.organizer_token`),
  posílá se jako `Authorization: Bearer`.
* **Stanoviště (OTSA)** — QR vede na `/station/:id?pin=123456`. FE PIN vymění
  přes `POST /api/station/login` za `ss.station_token` a ten používá u všech
  `/api/station/*` endpointů. Reset PINu, deaktivace stanoviště nebo uzavření
  závodu starý přístup zneplatní.

## Design

* Tailwind v3, CSS proměnné pro theme (světlo/tma přepínané classy `dark`).
* Primary = scout modrá `#336CAA` (210 54% 43%), accent = scout žlutá `#FCC11E`.
* Font Inter (sans) + JetBrains Mono (čísla). Nízký kontrast u muted textu,
  hairline borders, tabulky s `tabular-nums` pro body.
* Cíl: rozhodčí po naskenování QR zadá první záznam do ~10 s na mobilu.

## Známé TODO po MVP

* QR kódy v Login Cards renderovat přes `qrcode.react` (teď placeholder s URL).
* PDF export výsledkovky (BE vrací JSON, FE zatím neumí print-to-PDF layout).
* Real-time update dashboardu přes WebSockets — teď 10s polling.
* Offline režim (spec v2).
