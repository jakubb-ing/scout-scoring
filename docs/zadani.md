# Zadání projektu — Scout Scoring

Zadání zpětně zrekonstruované podle skutečné implementace (stav `main`,
verze v `VERSION`). Slouží jako podklad pro nabídku, převzetí projektu nebo
zadání obdobného řešení jinému dodavateli.

---

## 1. Kontext a cíl

Skautské závody hlídek se dnes bodují na papír: rozhodčí na stanovištích
zapisují body do archů, na konci se ručně sčítají a přepisují do tabulky.
To je pomalé, chybové a výsledky jsou hotové hodiny po doběhu.

**Cíl:** webová aplikace, která nahradí papírové bodovací archy. Rozhodčí
zadává body na mobilu přímo na stanovišti, organizátor vidí průběh živě
a výsledky jsou k dispozici okamžitě po uzavření závodu.

**Klíčová omezení prostředí:** závody se konají v terénu, kde je signál
slabý nebo žádný. Rozhodčí jsou dobrovolníci, kteří dostanou telefon do ruky
na pár hodin — aplikace nesmí vyžadovat instalaci ani školení. Zadání dětských
hodnocení musí být důvěryhodné a auditovatelné.

---

## 2. Role a způsob přístupu

| Role | Přístup | Co dělá |
|---|---|---|
| **Organizátor** | e-mail + heslo (JWT) | zakládá a spravuje závod, vidí vše |
| **Správce (admin)** | organizátor s příznakem `is_admin` | spravuje uživatelské účty |
| **Spoluorganizátor** | pozvánka k závodu, role `read` / `edit` | sdílený přístup k jednomu závodu |
| **Rozhodčí na stanovišti** | QR kód + PIN, bez účtu | zapisuje body své hlídce |
| **Doprovod hlídky** | QR kód hlídky + PIN, bez účtu | vyplňuje slovní zpětnou vazbu |
| **Veřejnost** | veřejný odkaz s kódem | čte výsledky uzavřeného závodu |

Požadavek: **role bez účtu se nesmí registrovat ani přihlašovat heslem.**
Přístup vzniká naskenováním vytištěného QR kódu a zadáním PINu; token je
krátkodobý a podepsaný, vázaný na konkrétní stanoviště / hlídku.

---

## 3. Životní cyklus závodu

```
draft ──prepare──▶ ready ──activate──▶ active ──close──▶ closed
  ▲                  │
  └───unprepare──────┘
```

| Stav | Co je povolené |
|---|---|
| `draft` | volná editace všeho: stanoviště, hlídky, kategorie, nastavení |
| `ready` | vydány a vytištěny QR kódy; editace stanovišť ano, u hlídek jen název a členové; **nepřidávat / nemazat**; zápis bodů ještě neběží |
| `active` | běží zápis bodů i zpětné vazby, živý dashboard |
| `closed` | zápis uzavřen, výsledky publikované, povolené jen opravy adminem |

Požadavky na přechody:

- **Vydávání PINů musí být idempotentní.** Opakovaný průchod stavem `ready`
  nesmí zneplatnit už vytištěné QR kódy (režim „jen chybějící").
  Znovuvydání je samostatná explicitní akce (`reissue_tokens`).
- Kdo naskenuje QR před spuštěním, uvidí obrazovku **„závod ještě nebyl
  spuštěn"**, která se sama dotazuje na změnu stavu — ne chybu 401.
- Login musí odlišit **„závod neběží"** od **„špatný PIN"**.
- `close` je **nevratný** — potvrzovací dialog musí vyjmenovat důsledky.
- `unprepare` (návrat do `draft`) resetuje aktivitu stanovišť.

---

## 4. Datový model (funkční požadavky)

- **Závod** — název, datum, místo, vlastník, stav, model bodování, režim
  měření času (`none` / `per_station` / `start_finish`), veřejný kód výsledků.
- **Kategorie** — per závod, příznak „soutěžní / nesoutěžní". Při založení
  závodu vzniknou tři výchozí (holčičí, klučičí, nesoutěžní).
- **Hlídka** — startovní číslo (unikátní v závodě), název, kategorie, seznam
  členů, příznak **stažení ze závodu** (`withdrawn`) s důvodem a časem.
  Stažená hlídka se **nemaže** a **nefiguruje ve výsledkové listině**.
- **Stanoviště** — název, pořadí a **dynamický seznam kritérií**
  (`{ název, max. bodů }`). Počet a podoba kritérií se liší závod od závodu;
  systém nesmí mít pevný počet sloupců. Volitelný krok bodování
  (1 / 0,5 / 0,25 bodu) určuje, po jakých dílech rozhodčí body zadává.
- **Bodový záznam** — právě jeden na dvojici stanoviště × hlídka
  (upsert, ne append), body po kritériích, volitelně čas příchodu a odchodu,
  identifikace autora zápisu.
- **Zpětná vazba hlídky** — N textů „co se povedlo" a M „prostor pro
  zlepšení", stav (rozepsáno / odesláno / znovuotevřeno), zámek zařízení.
- **Audit log** — každá mutace: kdo, co, kdy, před / po.

---

## 5. Funkční požadavky po rolích

### 5.1 Organizátor

1. **Založení závodu** — název, datum, místo, nastavení bodování a času.
2. **Hlídky** — jednotlivě i **hromadný import** (vložení seznamu),
   editace, mazání (jen před `ready`), **stažení / obnovení** hlídky.
3. **Stanoviště** — jednotlivě, hromadně a přes **AI import**: organizátor
   nahraje PDF nebo TXT s propozicemi závodu (max 5 MB), systém z něj
   vytěží návrh stanovišť a kritérií a doptá se na nejasnosti; po zodpovězení
   otázek se výsledek uloží. Konverzace je bezstavová — zavření dialogu
   znamená restart.
4. **Sdílení závodu** — pozvání dalšího organizátora s právem `read` / `edit`.
5. **Tisk QR kódů** pro stanoviště i hlídky (podklad pro terén).
6. **Živý dashboard** — celkový postup hodnocení, tabulka dokončenosti hlídek,
   průběh stanovišť, samostatná záložka **Live aktivita** s posledními zápisy.
   Aktualizace přibližně po 10 s.
7. **Výsledky** — tabulka za každou kategorii (pořadí, hlídka, body, rozdíl
   oproti předchozí), detail hlídky rozpadem na stanoviště a kritéria,
   **export / tisk A4** včetně QR kódu na online výsledky.
8. **Opravy bodů po uzavření závodu** — samostatná záložka „Opravy"
   (matice hlídka × stanoviště) s **povinným důvodem opravy**. Musí jít
   o oddělenou cestu, aby se povolení nemohlo prosáknout do zápisu na
   stanovišti. Veřejné výsledky ukazují jen „upraveno" + čas, nikoli důvod
   a jméno.
9. **Historie změn** — čitelný výpis auditu s exportem do CSV.
10. **Správa uživatelů** (admin) — založení, editace, reset hesla, smazání.

### 5.2 Rozhodčí na stanovišti

1. Naskenuje QR → zadá PIN → je přihlášen ke svému stanovišti.
2. Vybere hlídku (podle startovního čísla) a zapíše body po kritériích;
   podle nastavení závodu i čas příchodu a odchodu.
3. Opakovaný zápis téže hlídky **přepisuje** předchozí (žádné duplicity).
4. Vidí, které hlídky už má odbavené a které chybí.
5. **Musí fungovat offline** — viz kapitola 6.

### 5.3 Doprovod hlídky

1. Naskenuje QR hlídky → zadá PIN → mobilní formulář zpětné vazby.
2. Vyplní N polí „co se povedlo" a M polí „prostor pro zlepšení"
   (počty 0–10 nastavuje organizátor, celou funkci lze vypnout).
3. **Autosave po 5 s**, na závěr „Uzavřít a odeslat".
4. Organizátor může odeslané **odemknout k editaci**, ale obsah editovat
   nesmí. Okno je otevřené do `max(closed_at, reopened_at) + 12 h`.
5. Souběh dvou zařízení se řeší **zámkem s explicitním převzetím**
   (konflikt → tlačítko „Převzít vyplňování"), ne automatickým vypršením.
6. Viditelnost ve veřejných výsledcích je přepínač závodu, **default vypnuto** —
   jde o slovní hodnocení dětí.

### 5.4 Veřejnost

Veřejný odkaz s náhodným kódem zobrazí výsledky uzavřeného závodu.
Kód lze **regenerovat** (zneplatnění starého odkazu).

---

## 6. Offline režim (kritický požadavek)

Zápis bodů na stanovišti musí fungovat i bez signálu. Požadovaná architektura:

1. **PWA** — aplikace jde přidat na plochu, funguje po zavření prohlížeče.
2. **Read cache** — data potřebná ke skórování jsou lokálně k dispozici
   (řízeno explicitním allowlistem, ne plošným cachováním).
3. **Outbox** — fronta neodeslaných zápisů, která se sama odešle po návratu
   signálu. Všechny offline mutace jsou upserty podle přirozeného klíče,
   takže nepotřebují klientská ID.
4. Reálný scénář v terénu není tvrdý offline, ale **flaky síť** — každý
   požadavek musí mít timeout.
5. **Nic se nesmí tiše zahodit:**
   - odmítnutí kvůli uzavřenému závodu → položka zůstane ve frontě jako
     `blocked` a jde zachránit přes „Opravy";
   - vypršelá přihlášení → `blocked` + výzva k opětovnému přihlášení;
     re-login **nesmí smazat frontu**.
6. Konflikt offline zápisu s opravou: **last-write-wins**, bez verzování;
   invariant hlídá test.
7. Uživatel musí vidět, kolik zápisů čeká na odeslání, a rozpoznat
   zastaralou verzi aplikace (verze + git hash v patičce).

---

## 7. Nefunkční požadavky

- **Mobile-first.** Stanoviště i zpětná vazba se ovládají jednou rukou
  na telefonu za deště. Dashboard je použitelný i na tabletu.
- **Bez instalace a bez registrace** pro role v terénu.
- **Auditovatelnost.** Každá změna bodů dohledatelná — kdo, kdy, z čeho na co.
- **Bezpečnost.** Hesla hashovaná, tokeny podepsané, PINy v DB hashované.
  Produkční start **musí selhat**, pokud nejsou nastavené podpisové klíče —
  tiché použití vývojových defaultů je nepřijatelné.
- **Migrace schématu jsou aditivní a idempotentní**, spouštějí se jako
  release krok před startem nové verze, ne při startu aplikace
  (paralelně startující instance by si přepsaly evidenci migrací).
- **Verzování** — konvenční commity, automatický CHANGELOG a bump verze,
  verze viditelná v UI i v `/api/health`. Změna schématu = minimálně MINOR.
- **Testy** — testy nezávislé na DB musí projít bez běžící databáze;
  integrační testy proti DB jsou tagované zvlášť.

---

## 8. Technické zadání

- **Monorepo** — `apps/api` (backend), `apps/web` (frontend), `docs/`.
- **Backend:** Elixir / Phoenix, čisté JSON REST API bez server-side
  renderu. Autentizace: JWT pro organizátory, podepsané krátkodobé tokeny
  pro stanoviště a doprovod.
- **Frontend:** Next.js (App Router), React Query, PWA se service workerem,
  lokální fronta v IndexedDB.
- **Databáze:** SurrealDB 3.x, schemafull, vlastní verzované SQL migrace.
- **AI:** OpenAI Responses API se structured outputs (`strict: true`)
  pro import stanovišť; při neplatné odpovědi jeden retry, pak chyba 422.
  Bez API klíče musí zbytek aplikace fungovat.
- **Nasazení:** backend na fly.io (migrace jako `release_command`),
  frontend samostatně; tajné hodnoty výhradně přes secrets, nikdy v repu.

---

## 9. Rozsah dodávky

1. Funkční backend + frontend podle kapitol 3–7.
2. Verzované migrace schématu a seed prvního organizátora.
3. CI: kontrola názvů PR, automatické release PR, CHANGELOG a GitHub Release.
4. Dokumentace: README s dev setupem a nasazením, plány jednotlivých
   funkčních celků v `docs/`.
5. Testy: jednotkové (bez DB) i integrační (proti DB).

## 10. Mimo rozsah

- Registrace veřejných uživatelů, e-mailové notifikace, mobilní nativní app.
- Jiné modely bodování než součet bodů (`sum_points`) — datový model
  s dalšími počítá, implementace ne.
- Online platby, přihlašování hlídek na závod, správa startovní listiny
  mimo import seznamu.
