# Verzování aplikace — mini plán

Cíl: jedna verze pro celý monorepo, viditelná ve FE, posouvaná při každé
větší změně.

## Výchozí stav (ověřeno v kódu)

Většina věcí už existuje — chybí propojení, ne infrastruktura:

| co | kde | stav |
|---|---|---|
| `VERSION` | root | `0.1.0` ✅ |
| `version:` | `apps/api/mix.exs:7` | `0.1.0` ✅ |
| `"version"` | `apps/web/package.json:3` | `0.1.0` ✅ |
| CHANGELOG | `CHANGELOG.md` | Keep a Changelog + SemVer, sekce `[Unreleased]` ✅ |
| verze ve FE | — | **chybí** |
| verze v API | `/api/health` vrací jen `status` + `db` | **chybí** |
| sync těch tří míst | — | **chybí, dnes ruční** |

Takže start na 0.1.0 sedí, není co resetovat.

## 1. Nástroj: release-please

Ověřeno v repu: `.github` **neexistuje**, žádné CI neběží. Ale repo je na
GitHubu (`jakubb-ing/scout-scoring`) a posledních 8 commitů už používá
konvenční prefix `feat:`. To je přesně vstup, který release-please chce.

### Proč tenhle

| nástroj | verdikt |
|---|---|
| **release-please** (Google) | **Doporučeno.** GH Action čte konvenční commity, otevře „Release PR" s bumpem verzí + vygenerovaným CHANGELOGem. Merge PR = tag + GitHub Release. Umí updatovat libovolné soubory přes `extra-files`, takže zvládne `VERSION` i `mix.exs` i `package.json` naráz. Jazykově agnostický. |
| changesets | Ne. Stavěné pro JS monorepa publikující do npm; Elixir část neumí. |
| semantic-release | Ne. Vydává na každý merge bez review kroku, těžší konfigurace. |
| standard-version | **Ne — archivovaný**, autoři ho sami označili za deprecated. |
| git-cliff | Jen generuje CHANGELOG, verze v souborech neposouvá. |
| cocogitto (`cog`) | Rozumná záloha, když nechceš CI — běží lokálně, bumpne i otaguje. |

Rozhodující výhoda release-please je model **Release PR**: verze se
neposune samovolně, ale nachystá se PR, který si přečteš a mergneš, až
chceš vydat. To sedí na tvoje pravidlo „posunout verzi při větší změně",
protože release můžeš nechat nasbírat víc feature větví.

### Co je potřeba nastavit

1. `.github/workflows/release-please.yml` — jeden job na `push` do `main`.
2. `release-please-config.json`:
   - `"release-type": "simple"` (repo není ani čistě node, ani čistě mix),
   - `extra-files`:
     - `VERSION` — generic updater,
     - `apps/api/mix.exs` — generic updater, řádek anotovat komentářem
       `version: "0.1.0", # x-release-please-version`,
     - `apps/web/package.json` — `type: "json"`, `jsonpath: "$.version"`.
3. `.release-please-manifest.json` s `{".": "0.1.0"}` — start na 0.1.0,
   což odpovídá tomu, co v souborech dnes je.

Nástroj tak vlastní všechna tři místa a **nemůžou se rozejít** — odpadá
potřeba `version-check` i toho, aby `mix.exs` četl `VERSION` za běhu.

### Disciplína commitů

release-please klasifikuje podle prefixu: `feat:` → MINOR, `fix:` → PATCH,
`feat!:` / `BREAKING CHANGE:` → MAJOR. Commity bez prefixu (v historii jich
je pár, např. `404f080`, `442c73d`) se do CHANGELOGu nedostanou. Pro budoucí
práci to stačí hlídat u sebe; historii přepisovat nemá smysl.

Volitelně `.github/workflows/pr-title.yml` s kontrolou názvu PR — když se
merguje squashem, rozhoduje název PR, ne jednotlivé commity.

### Pokud CI nechceš

Fallback je **cocogitto**: `cog bump --auto` lokálně, `pre_bump_hooks`
updatují `mix.exs` a `package.json`, tag a CHANGELOG udělá sám. Žádný
GitHub Action, ale musíš si pamatovat ho spustit. Vlastní bash skript
(původní návrh) bych nechal až jako třetí volbu — udržovat vlastní parser
SemVeru a CHANGELOGu je zbytečná práce.

## 2. Zobrazení ve FE

**Komponenta** `components/app-version.tsx` — `v0.1.0`, malé,
`text-scout-text-muted`, `title` s build hashem když je k dispozici.

**Kam:**
- `components/app-shell.tsx` — patička organizátorské části.
- Přihlašovací stránka (`app/login/page.tsx`) pod formulářem — nejčastější
  místo, kde uživatel hlásí problém a ptáš se ho „jakou máš verzi".
- Stanoviště i feedback stránka: verze patří do patičky i tam. U PWA
  s offline cache je to **jediný způsob**, jak poznat, že rozhodčí běží
  na staré verzi z service workeru.

Formát: `v0.1.0`. V dev buildu `v0.1.0-dev`.

## 3. Verze v API

`/api/health` rozšířit:

```elixir
json(conn, %{status: "ok", db: db, version: Application.spec(:api, :vsn) |> to_string()})
```

Umožní ověřit, že nasazený backend odpovídá frontendu — u fly.io deploye
se to běžně rozejde a bez tohohle se to pozná jen podle chování.

Volitelně: FE si verzi API tahat nemusí, ale při neshodě major/minor by
šlo v dashboardu zobrazit varování „aplikace je zastaralá, obnov stránku".
Doporučuju **až později**, ne v prvním kroku.

## 4. Kdy posunout verzi

Podle SemVer pravidel, která už v `CHANGELOG.md` jsou:

- **MAJOR** — nekompatibilní změna API, dat nebo workflow.
- **MINOR** — nová funkce zpětně kompatibilní. Sem patří **všechny čtyři
  plánované věci**: opravy bodů, zpětná vazba, stav `ready`, offline režim.
- **PATCH** — opravy chyb a drobnosti.

Praktické pravidlo pro tenhle projekt: **verze se posouvá při mergi
feature větve do `main`**, ne při každém commitu. Migrace schématu je
vždycky minimálně MINOR.

## 5. Ruční příkazy

S release-please odpadá vlastní skript i `make version-bump` — bump dělá
Release PR. V `Makefile` stačí jeden pomocný cíl:

```
make version-show   # vypíše VERSION + mix.exs + package.json vedle sebe
```

Hodí se při ladění deploye, kdy chceš rychle vidět, co je v pracovní kopii.

## 6. Pořadí prací

| # | Krok |
|---|---|
| 1 | `.github/workflows/release-please.yml` + config + manifest na `0.1.0` |
| 2 | Anotovat `version:` v `mix.exs` komentářem `# x-release-please-version` |
| 3 | `next.config.ts` vystaví `NEXT_PUBLIC_APP_VERSION` z `package.json` |
| 4 | `AppVersion` komponenta + zapojení do patiček |
| 5 | `version` v `/api/health` |
| 6 | `make version-show`, poznámka o commit konvenci do `README.md` |

Krok 1 je jediný, který se musí ověřit v ostrém provozu — první Release PR
se objeví až po prvním `feat:` commitu na `main`.

## 7. Rozhodnutí

### R1 — V patičce je i git hash

**Rozhodnutí.** `AppVersion` zobrazí `v0.1.0` a k tomu prvních 7 znaků
commit hashe (`NEXT_PUBLIC_BUILD_SHA` z CI), vizuálně potlačeně.

**Odůvodnění.** Appka se stává PWA se service workerem a offline cache.
Bez build hashe nejde odlišit „uživatel má starou verzi ze SW cache" od
„nasazení neproběhlo" — obojí se navenek projeví identicky. U klasické
webovky by to byl luxus, u PWA je to diagnostická nutnost.

**Důsledek.** Hodnota musí vzniknout při buildu v CI; lokálně fallback
na `dev`. CI zatím neexistuje — zakládá ho krok 1 tohohle plánu; do té
doby patička ukazuje jen verzi bez hashe. U fly.io deploye se hash předá
jako build arg (`--build-arg NEXT_PUBLIC_BUILD_SHA=$(git rev-parse HEAD)`).

### R2 — Kontrola názvu PR ano

**Rozhodnutí.** `.github/workflows/pr-title.yml` s kontrolou konvenčního
formátu názvu PR.

**Odůvodnění.** Při squash-merge se název PR stává commit zprávou na `main`
a je to jediné, co release-please vidí. Bez kontroly se chyba projeví až
tím, že vydaná verze má špatný bump nebo prázdný CHANGELOG — a to se
opravuje hůř než překlep v názvu PR.

### R3 — release-please vytváří i GitHub Release

**Rozhodnutí.** Ponechat výchozí chování: tag + GitHub Release s poznámkami.

**Odůvodnění.** Je to nulová práce navíc (default) a Release stránka je
stabilní odkaz, kterým se dá ukázat „tohle běželo na závodě 14. 6.".
