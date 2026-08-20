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
