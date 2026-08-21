# Changelog

Všechny významné změny v projektu Scout Scoring se zapisují sem.

Formát vychází z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) a
projekt používá [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- `MAJOR` pro nekompatibilní změny API/dat/uživatelských workflow.
- `MINOR` pro nové zpětně kompatibilní funkce.
- `PATCH` pro opravy chyb a drobné bezpečné úpravy.

## [0.2.0](https://github.com/jakubb-ing/scout-scoring/compare/v0.1.0...v0.2.0) (2026-08-21)


### Features

* Add category badge component and integrate into patrols and score forms for improved category display ([89619e2](https://github.com/jakubb-ing/scout-scoring/commit/89619e2b6478c47316d0ae42c60c7bfd99a6a5ea))
* Add coeditor of races, add login for stations, add admin roles, and more ([e043222](https://github.com/jakubb-ing/scout-scoring/commit/e043222dfddf02b8da5fe2885444a1c0a0e8ceb4))
* Add phone icon link to organizer in station header ([a40ca58](https://github.com/jakubb-ing/scout-scoring/commit/a40ca58dd8367e42afd60ecc3a1b11fe3f036e5d))
* add public /wiki page describing the app per role ([e0aa05d](https://github.com/jakubb-ing/scout-scoring/commit/e0aa05d508f32138cf172e374cf0a511cc628566))
* add release-please versioning, app version in FE footer and /api/health ([9511533](https://github.com/jakubb-ing/scout-scoring/commit/951153322709b61bb8ea5604bd70cfba46cfb4fa))
* Add results page and patrol results detail view with improved data handling and UI components ([8ee3b9d](https://github.com/jakubb-ing/scout-scoring/commit/8ee3b9d80f4c8bf76ab43e693d8da8866c24f1e3))
* Enhance mobile and tablet dashboard UI with hamburger menu for race selection and settings ([79f2982](https://github.com/jakubb-ing/scout-scoring/commit/79f2982a597977b15974a057c3dcb202511423f2))
* Implement allow_half_points feature for stations and update related components ([0b47d2b](https://github.com/jakubb-ing/scout-scoring/commit/0b47d2b8d00b9de102e3e2ac71b9db051fe454d7))
* Implement public results access code feature for races ([383b6f0](https://github.com/jakubb-ing/scout-scoring/commit/383b6f0f299559185115e7e4fc84fd37beceedb2))
* Introduce context-mode routing rules and rate limiting for login endpoints in API ([9380011](https://github.com/jakubb-ing/scout-scoring/commit/93800118919f37d9ced9d6018c82add6b3ea5c40))
* offline station mode — PWA shell, persisted read cache and outbox ([6568ca0](https://github.com/jakubb-ing/scout-scoring/commit/6568ca033374a90c65a0a5e6881ef0cdcb4e87d7))
* patrol feedback — offline form for accompanying adults with lock and audit ([1f609cd](https://github.com/jakubb-ing/scout-scoring/commit/1f609cdacad9d82402186e984d6fa55bc7b5f922))
* race ready state — prepare/unprepare, idempotent PIN issuing, patrol withdrawal ([bfc3ce7](https://github.com/jakubb-ing/scout-scoring/commit/bfc3ce78b35203cb896ae333309f81ec9f6b1b42))
* reorganize organizer dashboard ([e637299](https://github.com/jakubb-ing/scout-scoring/commit/e63729925ef34d7a7df02a335fc6da427159267a))
* resolve the build sha automatically instead of requiring an env var ([05fa08e](https://github.com/jakubb-ing/scout-scoring/commit/05fa08e4fb2e4327c09212c85918c22b356f8125))
* rework the judge flow and the organizer overview for faster scanning ([5d376f9](https://github.com/jakubb-ing/scout-scoring/commit/5d376f9f9f5031be9acf4f214067537e168b2a3e))
* score corrections after race close with audit history UI ([9883b90](https://github.com/jakubb-ing/scout-scoring/commit/9883b901617326d246d7bc5449a9c4048470c1f9))
* Update Fly.io configuration for API with improved machine management and concurrency settings ([455ae25](https://github.com/jakubb-ing/scout-scoring/commit/455ae25a7dc9c78a7d0af48e0e51f4ef3e45af6d))


### Bug Fixes

* 'Zkusit hned' on the waiting screen kicked the user to an error page ([67c3782](https://github.com/jakubb-ing/scout-scoring/commit/67c37825bea80903fdc030c9830eecca2be3b46d))
* AI import was aborted after 8s by the shared apiFetch timeout ([9aea279](https://github.com/jakubb-ing/scout-scoring/commit/9aea279d01ccbdf47f8cfdab2e1cc464546d8164))
* any edit of a race created before migration 008 returned 404 ([6f764aa](https://github.com/jakubb-ing/scout-scoring/commit/6f764aad27a122defef1f6df5f4c5caf2265e167))
* fly.toml pointed at the wrong SurrealDB namespace ([a84caf5](https://github.com/jakubb-ing/scout-scoring/commit/a84caf56a97d442952bfa2ea2aaea819831f0c7d))
* improve feedback and patrol addition UI in PatrolsTab component ([549b8b7](https://github.com/jakubb-ing/scout-scoring/commit/549b8b711a0f720a7baf2d363d9e7f714fc49fd7))
* refuse to boot in production without explicit SurrealDB config ([033a48c](https://github.com/jakubb-ing/scout-scoring/commit/033a48c97fee32cc00291d87f82783760857dc84))
* stop the built service worker from leaking into dev ([fb7a118](https://github.com/jakubb-ing/scout-scoring/commit/fb7a1180f0a6f53e6f7c2d19226a8cae95acd360))

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
- Testy: 217 testů API (čisté unit + integrační proti SurrealDB přes
  `Api.DBCase`, request testy přes `Api.APICase`) a 19 testů offline
  outboxu na webu; `make test`, `make test-db`, CI workflow `test.yml`.
- Dodatečné opravy bodů po uzavření závodu: záložka „Opravy" s maticí
  hlídka × stanoviště, dialog s povinným důvodem a přehledem
  „původně X → nově Y", panel „Historie změn" s filtrem, stránkováním
  a exportem do CSV. Ve výsledcích se opravený záznam přiznává odznakem
  „upraveno" s časem (bez důvodu a jména — ty zůstávají v audit logu).
- Prompt „Je k dispozici nová verze" — service worker se vyměňuje až po
  potvrzení, ne uprostřed práce.
- Samostatná záložka Live aktivita s desetisekundovým obnovováním posledních
  zápisů bodů ze stanovišť.
- Výsledková stránka uzavřeného závodu s tabulkami po kategoriích.
- Detail hlídky s body po stanovištích a rozbalením podúkolů/kritérií.
- A4 export výsledků s QR kódem na online výsledkovou stránku.

### Fixed

- Stažení hlídky bez uvedeného důvodu selhávalo (`NULL` do `option<string>`).
- Po odemčení zpětné vazby adminem dostal doprovod chybu serveru — pole
  `lock_device` po `NONE` ze záznamu mizí a pattern match na něj nesedl.
- Přihlášení stanoviště hlásilo v přípravě i po uzavření závodu „špatný
  PIN" místo skutečného stavu; plug po uzavření vracel 401 místo 423,
  takže offline fronta radila zbytečné přihlášení.
- Actor se v nových cestách zapisoval do audit logu dvakrát prefixovaný.
- `Scoring.delete_entry/3` padalo na kódování audit payloadu.
- Prohozené chybové kódy při sdílení závodu (`invalid_role` vs.
  `invalid_member`).

### Changed

- Organizátorský Přehled zobrazuje celkový postup a pod ním vedle sebe postup
  hlídek a průběh stanovišť; stavové akce jsou v headeru závodu a Live
  aktivita má vlastní záložku.
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
