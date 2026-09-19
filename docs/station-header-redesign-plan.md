# Redesign stránky stanoviště podle mockupu `new_station.html` (varianta B)

Mockup byl bundlovaný React/Tailwind prototyp (`docs/new_station.html`, 1,3 MB —
v repu se nedrží, zdroj má autor návrhu). Zdroj designu je funkce
`HeaderB` + `PatrolList` + `MoreMenu` (sekce `b` v canvasu, artboardy
`online` / `offline` / `rozbalené ⋯ menu`). Paleta `K` v mockupu se **shoduje**
s `scout.*` tokeny v `apps/web/tailwind.config.ts`, font DM Sans už projekt
používá (`app/layout.tsx`). Jde tedy o přestavbu skladby hlavičky, ne o nový
design systém.

Dotčené soubory:
- `apps/web/app/station/[stationId]/page.tsx`
- `apps/web/components/station/patrol-picker.tsx`
- `apps/web/components/station/offline-indicator.tsx`
- `apps/web/tailwind.config.ts` (2–3 nové odstíny)

---

## 1. Hlavička — přestavba (`page.tsx`)

**Dnes:** modrý pruh, vlevo tečka/šipka zpět + „Stanoviště" + název, vpravo
pět prvků: `OfflineIndicator` badge, počet hlídek badge, telefon, obnovit,
odhlásit. Na mobilu je to přeplněné a stav se tříští mezi badge a ikony.

**Cíl (varianta B):**
- Řádek 1: **tečka stavu** (7 px; `#4ADE80` online / `scout-yellow` offline) +
  drobný uppercase popisek 11/600, `white/60`:
  - online → `STANOVIŠTĚ #{position}`
  - offline / čekající zápisy → `OFFLINE · N ZÁPISŮ ČEKÁ NA ODESLÁNÍ`
- Řádek 2: název stanoviště 21/700 bílý, `truncate`.
- Vpravo jediné tlačítko **⋯** (ostatní ikony mizí).
- Celé pozadí hlavičky se v offline stavu překlopí z `scout-blue` na
  hnědo-jantarovou `#5E4418` — stav je pak vidět periferně, bez čtení.
- Spodní hrana hlavičky: **progress bar** — 5 px, track `white/20`, výplň
  `scout-yellow`, vpravo popisek `N / M odbaveno` (12/600, `white/75`).

**Co je k tomu potřeba:**
- Do hlavičky protáhnout `done` / `total`. Dnes se počítají uvnitř
  `PatrolPicker`. Buď je spočítat v `page.tsx` (`entries` + `payload.patrols`
  tam už jsou) a předat dolů, nebo je jen nepočítat dvakrát — preferuji
  výpočet v `page.tsx`.
- `Station.position` jako číslo stanoviště (`STATION.num` z mockupu).
- Zachovat větev `mode === "score"`: mockup skórovací obrazovku neřeší, takže
  hlavička ve formuláři zůstane s šipkou zpět (tečka → `ArrowLeft`), zbytek
  skladby stejný.

## 2. Menu pod ⋯ (nová komponenta, `dropdown-menu.tsx` už v projektu je)

Bílá karta `rounded-12`, `border-scout-border`, stín, šířka ~214 px, položky
s ikonou 17 px:
1. **Obnovit data** → dnešní `refresh()`
2. **Zavolat podporu** → `tel:776884100` (dnes ikona v hlavičce)
3. **Odhlásit ze stanoviště** → `requestLogout()`, červeně (`scout-red`, 600)

Potvrzovací dialog o neodeslaných zápisech zůstává beze změny.

## 3. Offline indikátor — přesun do hlavičky (`offline-indicator.tsx`)

Badge z hlavičky mizí; komponenta se změní z „badge" na **zdroj stavu**.
Navrhuji ji rozdělit:
- `useStationStatus(chainKeyPrefix)` → `{ tone, caption }` pro řádek 1 hlavičky
  a barvu pozadí,
- toasty po flushnutí outboxu (`onFlushResult`) zůstávají — jen se přesunou do
  hooku / page, ať se nenavážou na zrušený badge.

Mapování stavů na variantu B (mockup zná jen online/offline, zbytek musíme
dourčit — návrh):

| stav | pozadí hlavičky | tečka | popisek |
|---|---|---|---|
| online, čisto | `scout-blue` | zelená `#4ADE80` | `STANOVIŠTĚ #N` |
| offline, čisto | `#5E4418` | `scout-yellow` | `OFFLINE — ZÁPISY V ZAŘÍZENÍ` |
| pending > 0 | `#5E4418` | `scout-yellow` | `OFFLINE · N ZÁPISŮ ČEKÁ NA ODESLÁNÍ` |
| blocked / authBlocked > 0 | `scout-red-deep` | `scout-red` | `N ZÁPISŮ VYŽADUJE ŘEŠENÍ` |

Blokované zápisy jsou jediný stav, který po rozhodčím něco chce — proto si
drží vlastní (červenou) barvu i dnešní `BlockedEntriesNotice` v obsahu.

## 4. Seznam hlídek (`patrol-picker.tsx`)

- **`ProgressSummary` smazat** — bílá karta s progressem se přesouvá do
  hlavičky. `PatrolPicker` tím ztratí props-free výpočet a bude jen seznam.
- Sladit rozměry řádku s mockupem: `rounded-12`, `border` 1 px (dnes 1.5),
  `px-3.25 py-2.75`, `gap-3`, `mb-2`; kolečko 40 px (dnes 44), písmo 15/700.
- Popisek sekce: 11/700, `tracking-0.7`, uppercase, `text-scout-text-muted` —
  dnes 600/`tracking-0.6`, drobnost.
- Sekce „Odbaveno", zvýraznění po uložení, pending stav (`CloudUpload`, „čeká
  na odeslání") a `CategoryBadge` **zůstávají** — mockup je neukazuje, protože
  má prázdnou frontu, ne proto, že by se rušily.
- Odsazení: v mockupu seznam začíná hned pod hlavičkou s `padding: 0 14px`
  a pozadím `scout-bg-app` — dnes `px-3.5 py-4`, stačí sjednotit.

## 5. Tokeny (`tailwind.config.ts`)

Doplnit do `scout`:
- `blue.offline: "#5E4418"` (pozadí hlavičky v offline stavu)
- `status.online: "#4ADE80"` (tečka)
- volitelně `amber.soft: "#FDF3E0"` / `amber.line: "#E8B75C"` — použije se jen
  pokud bychom někde nechali světlý jantarový pruh (varianta A/C); pro B
  nejsou nutné.

## 6. Drobnosti k opravě při té příležitosti

- Kořenový `<div>` v `page.tsx` má `flex flex-col overflow-hidden`, ale žádnou
  výšku — sticky hlavička + scrollující `main` spoléhají na výšku z layoutu.
  Doplnit `h-dvh` (nebo ověřit, že ji dává rodič), jinak se progress v
  hlavičce odscrolluje pryč.
- Hlavička dnes žije v `max-w-4xl` kontejneru — zachovat kvůli desktopu,
  mockup je jen 390px mobil.

## 7. Pořadí prací

1. Tokeny + `useStationStatus` (rozpad `OfflineIndicator`).
2. Nová hlavička v `page.tsx` včetně progressu a ⋯ menu.
3. Odstranění `ProgressSummary` a doladění řádků v `PatrolPicker`.
4. Vizuální kontrola tří stavů z mockupu: online / offline / otevřené menu.

## Co plán vědomě neřeší

Mockup pokrývá **jen hlavičku a frontu hlídek**. Skórovací formulář
(`score-form.tsx`, `criteria-inputs.tsx`), obrazovka „závod neběží"
(`race-not-started.tsx`) a přihlašovací stránka `app/station/page.tsx`
zůstávají beze změny — pro ně v mockupu není předloha. Pokud mají
vypadat stejně, je potřeba doplnit návrh.
