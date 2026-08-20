# Changelog

Všechny významné změny v projektu Scout Scoring se zapisují sem.

Formát vychází z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) a
projekt používá [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- `MAJOR` pro nekompatibilní změny API/dat/uživatelských workflow.
- `MINOR` pro nové zpětně kompatibilní funkce.
- `PATCH` pro opravy chyb a drobné bezpečné úpravy.

## [Unreleased]

### Added

- Verzování přes release-please: Release PR drží v souladu `VERSION`,
  `mix.exs` a `package.json`; kontrola konvenčního názvu PR v CI.
- Verze aplikace v patičce FE (`AppVersion` — login, dashboard, stanoviště)
  a v odpovědi `GET /api/health`.
- `make version-show` vypíše verze ze všech tří míst.
- Offline režim stanoviště: PWA (Serwist, manifest, instalovatelná appka),
  read cache station dat v IndexedDB (allowlist query keys) a outbox —
  fronta zápisů bodů v Dexie s dedupe, řetězením a Web Locks flusherem.
  Zápisy zablokované uzavřením závodu (423) nebo resetem PINu (401) se
  nezahazují; UI je hlásí a nabízí cestu k nápravě.
- Indikátor offline stavu a čekajících zápisů v hlavičce stanoviště,
  odlišení neodeslaných hlídek v seznamu, potvrzovací dialog při odhlášení
  s neprázdnou frontou.
- Timeout 8 s v `apiFetch` a sdílená detekce offline (captive portály).
- Nový stav závodu `ready` (draft → ready → active → closed, návrat
  ready → draft): `prepare` vydá PINy a QR idempotentně (`:missing_only`),
  tisk karet se odemyká už v `ready`, editace hlídek je omezená na název
  a členy (`field_locked`), stanoviště jdou upravovat celá.
- Stažení nedostavené hlídky (`withdraw`/`restore`) místo mazání —
  leaderboard ji vynechá, zápisy zůstávají; badge „nedostavila se".
- Station login rozlišuje „závod ještě nebyl spuštěn" (409) od špatného
  PINu (401); obrazovka čekání na spuštění s pollingem po 30 s.
- Zpětná vazba od doprovodu hlídky: offline mobilní stránka
  `/feedback/[patrolId]` (QR + PIN hlídky), autosave po 5 s, lock
  s explicitním převzetím mezi zařízeními, uzavření s upozorněním na
  prázdná pole; okno do `closed_at + 12 h`, reopen adminem ho prodlužuje.
- Nastavení zpětné vazby v závodě (zapnutí, počty polí 0–10, zveřejnění
  ve výsledcích — default vypnuto), QR karty pro doprovod v záložce
  Hlídky, stav odevzdání a „Vrátit k editaci" (obsah admin editovat
  nemůže, verze textu jsou v audit logu), sekce v detailu hlídky.
- Prompt „Je k dispozici nová verze" — service worker se vyměňuje až po
  potvrzení, ne uprostřed práce.
- Live aktivita v dashboardu ukazuje jednotlivé průchody hlídek stanovišti.
- Výsledková stránka uzavřeného závodu s tabulkami po kategoriích.
- Detail hlídky s body po stanovištích a rozbalením podúkolů/kritérií.
- A4 export výsledků s QR kódem na online výsledkovou stránku.

### Changed

- Mobilní rozestupy na dashboardu, výsledcích a detailu hlídky jsou kompaktnější.
- Mobilní a tabletová dashboard hlavička přesouvá výběr závodu, nastavení, uživatele a logout do hamburger menu.
- Root README popisuje aktuální frontend trasy, dashboard activity payload a výsledkové workflow.

## [0.1.0] - 2026-05-11

### Added

- Počáteční MVP aplikace Scout Scoring.
- Phoenix REST API se SurrealDB pro závody, kategorie, hlídky, stanoviště, bodování a výsledky.
- Next.js frontend pro organizátora a rozhodčí.
- Organizátorský dashboard se správou závodu, hlídek, stanovišť a nastavení.
- Stanovištní flow pro rozhodčí přes QR/PIN.
- AI import stanovišť z dokumentů.
