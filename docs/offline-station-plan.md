# Offline režim — plán

Cíl: znovupoužitelná offline vrstva. Prvním konzumentem je stanoviště
(`/station`, `/station/[stationId]`), další části se přidávají registrací,
ne kopírováním kódu.

## Východiska (ověřeno v kódu)

- FE nemá dnes žádný service worker, manifest ani PWA (`apps/web/package.json`, `next.config.ts` jsou holé).
- Station flow žije ve dvou routách; `/station/[stationId]` drží `pick` i `score` mód ve state, ne v URL.
- Data pro zápis přijdou ze dvou GET volání: `/api/station/me` (stanoviště + kritéria + hlídky) a `/api/station/scores` (už zapsané entries). Dohromady jednotky KB.
- Zápis je jediná mutace: `POST /api/station/scores` (`lib/api/station.ts`).
- **Server je čistý upsert** — `score_entry` má UNIQUE index na (station, patrol) a `Scoring.upsert_entry/5` přepisuje, staré hodnoty jdou do `audit_log`. Přehrání requestu je idempotentní; nepotřebujeme merge ani verzování.
- **Station token má TTL 72 h** (`api_web/plugs/authenticate_station.ex:14`). Na jednodenní závod token nevyprší → offline fronta se nemusí řešit re-authem.
- API běží na jiném originu (`NEXT_PUBLIC_API_URL`), `apiFetch` posílá `cache: "no-store"` a nemá timeout.

## Architektura: tři vrstvy

1. **App shell** — Serwist / service worker. Precache statiky a HTML navigací, aby refresh v offline vůbec něco vrátil. Nic víc.
2. **Read cache** — react-query `PersistQueryClientProvider` nad IndexedDB. Které query se persistují, řídí jeden allowlist.
3. **Outbox** — generická fronta mutací v Dexie. Které mutace do ní jdou, řídí registr mutací.

Záměrně **necachovat API odpovědi v service workeru.** Jsou cross-origin, nesou `Authorization` header a jsou `no-store`; SW cache by tu byla druhý zdroj pravdy vedle react-query a těžko se ladí. Vrstvy 2 a 3 běží v aplikaci, kde je vidět do nich devtoolsy react-query.

---

## Fáze 1 — PWA skelet

Appka se chová dál 1:1 stejně, jen je instalovatelná.

- `npm i @serwist/next serwist`, `next.config.ts` obalit `withSerwist`.
- `app/sw.ts` s `defaultCache` + precache manifestem, **bez** runtime pravidel na `NEXT_PUBLIC_API_URL`.
- `public/manifest.json` + ikony, `display: "standalone"`, `start_url: "/station"`.
- Navigation fallback pro dynamické routy (`/station/[stationId]`) — nejsou v precache manifestu, bez fallbacku offline refresh spadne na chrome-error stránku.
- **Update strategie SW:** nová verze se instaluje na pozadí, ale **neaktivuje se sama** uprostřed práce. Když čeká waiting worker, UI zobrazí toast „Je k dispozici nová verze" s tlačítkem „Obnovit" (`skipWaiting` až na kliknutí + reload). Verze + hash v patičce (versioning-plan R1) slouží ke kontrole, tohle je mechanismus výměny.
- Ověření: build, install na mobilu, appka identická online.

## Fáze 2 — Read cache (generická)

- `npm i @tanstack/query-persist-client-core @tanstack/react-query-persist-client idb-keyval`.
- Root provider → `PersistQueryClientProvider` s IDB persisterem, `maxAge` **72 h** — stejné okno jako TTL station tokenu. U dvoudenního závodu nesmí cache vypršet dřív než token, jinak druhý den ráno offline start selže.
- `lib/offline/persisted-queries.ts` — allowlist prefixů query keys, které se smí persistovat. Dnes `qk.stationMe`, `qk.stationEntries`. Nová offline část = jeden řádek sem.
- `dehydrateOptions.shouldDehydrateQuery` čte ten allowlist. Nic z organizátorské části se nepersistuje omylem.
- Dotčeným query nastavit `networkMode: "offlineFirst"` a vyšší `staleTime`.
- Stránky se nemění vůbec — žádná výměna hooků.

## Fáze 3 — Outbox (generická)

`lib/offline/outbox.ts` + `lib/offline/db.ts`:

- Dexie tabulka `outbox`: `{ id, kind, dedupeKey, payload, createdAt, attempts, lastError }`.
- **Registr mutací**: `kind` → `{ send(payload), dedupeKey(payload), onApplied(qc, payload) }`. Nová offline mutace = nová položka v registru.
- `dedupeKey` je unique index. Druhý offline zápis stejné hlídky přepíše ten čekající, místo aby se poslaly dva.
- `useOfflineMutation(kind)` — hook, který zapíše do Dexie, udělá optimistický update react-query cache přes `onApplied`, a pak zkusí síť.
- Flusher: na `online` eventu, při mountu a intervalem ~30 s. Sekvenčně, `attempts++`. 4xx (mimo 401/408/423/429) = zahodit a nahlásit, 5xx/síť = nechat ve frontě. **423 a 401 viz rozhodnutí R3 a R4 níže — nikdy nezahazovat.**
- **Cross-tab zámek:** celý průchod flusheru běží uvnitř `navigator.locks.request("outbox-flush", ...)` (Web Locks API). Dva otevřené taby jinak flushují souběžně — u idempotentních upsertů to „jen" plýtvá requesty, u mutací s pořadím (feedback draft → submit) by to rozbilo sémantiku.
- **Řetězení položek:** registr mutací může definovat `chainKey(payload)` (např. `patrolId`). Položky se stejným `chainKey` se odesílají v pořadí vložení a **selhání ponechatelnou chybou (5xx, síť, 423, 401, konfliktní 409) blokuje další položky téhož řetězce** — flusher je přeskočí a pokračuje jiným řetězcem. Konkrétní motivace: `feedback.submit` nesmí odejít, dokud neprošel poslední `feedback.draft` téže hlídky.
- `useOutboxStatus()` — počet čekajících položek, volitelně filtrovaný podle `kind`, pro UI indikátory.

## Fáze 4 — Zapojení stanoviště (první konzument)

- Zaregistrovat `kind: "station.score"` — `send` = `StationApi.upsertScoreEntry`, `dedupeKey` = `${stationId}:${patrolId}`, `onApplied` = merge do `qk.stationEntries`.
- `useUpsertScoreEntry` přepsat na `useOfflineMutation("station.score")`. `ScoreForm` se nemění — po uložení hlásí úspěch okamžitě, pro rozhodčího není rozdíl mezi „uloženo" a „uloženo lokálně".
- Indikátor stavu v hlavičce stanoviště: online / offline / „N čeká na odeslání".
- Badge `X/Y hlídek` musí počítat i položky z outboxu, jinak to vypadá, že se zápis ztratil.
- `PatrolPicker` odlišit hlídky s čekajícím zápisem.

## Fáze 5 — Síťová odolnost

- `apiFetch`: přidat `AbortSignal.timeout(~8 s)`. Bez toho appka na slabém signálu visí desítky sekund místo aby spadla do offline větve. Reálný scénář na louce je flaky síť, ne tvrdý offline.
- Sjednotit detekci offline: `navigator.onLine` lže u captive portálů, brát i vytimeoutované requesty jako signál „offline".

## Fáze 6 — Verifikace

- DevTools → Offline (nutné, ale nestačí).
- DevTools → „Slow 3G" throttling, a reálný test: letadlový režim na telefonu uprostřed vyplňování formuláře, pak refresh, pak zpět online.
- Scénář: zápis offline → zavření appky → otevření → fronta přežila a odešla.
- Scénář: dvakrát offline zápis stejné hlídky → odejde jeden request s posledními hodnotami.
- Scénář: dva otevřené taby stanoviště → flush proběhne jen jednou (Web Locks).
- Scénář: reset PINu za běhu → položky spadnou do `blocked`, po re-loginu odejdou.
- Scénář: nasazení nové verze → toast „Obnovit", po kliknutí běží nový SW, fronta přežila.

---

## Rozhodnutí

### R1 — Outbox nepotřebuje klientská ID

**Kontext.** Kdyby některá offline část zakládala nové entity, outbox by
potřeboval klientsky generovaná ID a jejich remapování po syncu.

**Rozhodnutí.** Nepotřebuje. Všechny plánované offline mutace jsou upserty
podle přirozeného klíče: zápis bodů podle (stanoviště, hlídka), zpětná
vazba podle hlídky (`patrol_feedback` má UNIQUE na `patrol`). Zakládání
hlídek a stanovišť je vázané na stav `draft`, kdy organizátor sedí u počítače.

**Důsledek.** Tvar `outbox` tabulky zůstává jednoduchý. Kdyby někdy přibyla
offline mutace zakládající entitu, je to vědomá revize tohohle rozhodnutí,
ne detail — remapování ID se dotkne celého registru mutací.

### R2 — Konflikt s opravou: last-write-wins, bez verzování

**Kontext.** Rozhodčí zapíše offline, organizátor mezitím body opraví,
flush outboxu opravu přepíše.

**Rozhodnutí.** Přijímáme last-write-wins. Neposíláme `updated_at`
a server starší zápis neodmítá.

**Odůvodnění.** Dodatečné opravy jsou nově možné **jen po uzavření závodu**
(viz `score-correction-plan.md`), takže se s běžícím offline zápisem
v praxi nepotkají. Alternativa by znamenala řešit konflikt na mobilu
v terénu, což je horší UX než vzácný přepis dohledatelný v `audit_log`.

**Pojistka.** Rozhodnutí stojí na score-correction R1 (opravy jen
v `closed`). Invariantu hlídá API test „`correct_entry` v `active` vrací
409" — kdyby se opravy někdy povolily za běhu závodu, test spadne
a vynutí vědomou revizi tohohle rozhodnutí, ne tichý návrat přepisů.

### R3 — 423 po uzavření závodu se NESMÍ zahodit

**Kontext.** Fáze 3 říká „4xx (mimo 401/408/429) = zahodit a nahlásit".
`Scoring.upsert_entry/5` vrací u uzavřeného závodu **423**, což je 4xx.

**Reálný scénář ztráty dat:** rozhodčí zapíše hodnocení offline v 15:00,
organizátor v 16:00 závod uzavře, telefon chytí signál v 16:30 → flush
dostane 423 → položka se zahodí a **hodnocení je nenávratně pryč**.
Rozhodčí přitom v aplikaci celou dobu viděl „uloženo".

**Rozhodnutí.** `423` se přidává k výjimkám vedle 401/408/429. Položka
zůstane v outboxu se stavem `blocked` a UI ji ukáže jako
*„N hodnocení nešlo odeslat — závod byl mezitím uzavřen"* s čitelným
výpisem bodů, aby je organizátor mohl přepsat ručně.

**Důsledek.** Zotavení vede přes záložku „Opravy" ze
`score-correction-plan.md`, která funguje právě jen u uzavřeného závodu.
Ty dva plány na sebe navazují — pořadí implementace to musí respektovat,
nebo alespoň zůstat u varování bez cesty k nápravě.

### R4 — 401 v outboxu se také nezahazuje

**Kontext.** Reset PINu stanoviště rotuje `token_nonce` a zneplatní vydaný
token. Flush pak dostane 401; pravidlo „4xx zahodit" by čekající zápisy
smazalo, ponechání bez UI by naopak znamenalo tichý nekonečný retry, který
uživatel nemá jak vyřešit.

**Rozhodnutí.** 401 přesune položky daného stanoviště do stavu `blocked`
(stejný stav jako u 423) a UI zobrazí *„N zápisů čeká na odeslání —
je potřeba se znovu přihlásit PINem"* s odkazem na přihlášení. Po úspěšném
re-loginu se `blocked` položky vrátí do fronty a flush se spustí hned.

**Důsledek.** Re-login (výměna PINu za nový token) **nesmí mazat outbox** —
mazání fronty patří jen k explicitnímu odhlášení s potvrzovacím dialogem
(bod 5 níže).

---

## Co je potřeba dodefinovat na FE

Konkrétní věci v existujícím kódu, které offline režim rozbije nebo které
nemají dnes definovaný tvar. Řešit ve fázi 3–4, ale rozhodnout předem.

### 1. Query keys nejsou scoped na stanoviště
`qk.stationEntries` a `qk.stationMe` jsou konstanty (`["station","entries"]`,
`["station","me"]` — `lib/queries/keys.ts`). Dnes to nevadí, protože se to vždy
refetchne online. S persistovanou cache se data z předchozího stanoviště
namapují na nové.
→ Změnit na `stationMe(stationId)` / `stationEntries(stationId)`.
Dotčené: `lib/queries/station.ts`, `app/station/[stationId]/page.tsx` (invalidace
na 3 místech — `refresh`, `logoutStation`, PIN exchange).

### 2. Tvar lokálního (neodeslaného) záznamu
`ScoreEntry` má serverová pole `id`, `created_at`, `updated_at`, `submitted_by`,
která lokální zápis nemá.
→ Definovat `PendingScoreEntry = Omit<ScoreEntry,"id"> & { id: "local:<station>:<patrol>", _pending: true }`
a v cache držet sjednocený typ. `existingForSelected` hledá přes `e.patrol`, ne
přes `id`, takže předvyplnění formuláře funguje i pro pending záznam.

### 3. Error state přebíjí cache
`app/station/[stationId]/page.tsx` má `if (errorMsg || !payload)` → EmptyState
„Přístup se nezdařil". Offline fetch selže a `stationMeError` se nastaví i když
je v cache platný payload.
→ Podmínku otočit: chybu ukázat jen když **není** `payload`. Když data jsou,
jen zobrazit offline indikátor.

### 4. Bootstrap s PINem vyžaduje síť — ROZHODNUTO
`POST /api/station/login` potřebuje odpověď, nedá se frontovat.
→ **První přihlášení stanoviště musí proběhnout online.** Offline sken QR
zobrazí hlášku „Pro první přihlášení stanoviště je potřeba připojení k síti."
Uložený token (72 h) pak offline stačí; cesta bez PINu už dnes funguje
(`hasStoredStationToken`).

### 5. Odhlášení s neprázdnou frontou — ROZHODNUTO
→ **Potvrzovací dialog.** Text varuje, že neodeslané zápisy budou nenávratně
ztraceny, a uvádí jejich počet. Po potvrzení se maže token i outbox pro dané
stanoviště. Bez čekajících položek se dialog nezobrazuje.

### 6. `start_url` v manifestu — ROZHODNUTO
→ **Poslední stanoviště z cache.** `start_url: "/station"`, ale stránka výběru
při mountu zkontroluje uložený station token + `stationId` a přesměruje rovnou
na `/station/[stationId]`. Bez platného tokenu zůstane na výběru.
Poslední `stationId` ukládat do localStorage vedle tokenu.

### 7. Datum v `arrived_at` / `departed_at` — ROZHODNUTO
`ScoreForm` skládá timestamp z `new Date()` v okamžiku submitu, ne flushe.
→ **Ponechat beze změny.** Závod běží přes den, půlnoc se neřeší.

---

## Indikátor offline stavu

Jeden komponent v hlavičce stanoviště (`app/station/[stationId]/page.tsx`),
řízený dvojicí `(isOffline, pendingCount)` z `useOutboxStatus()`.

| Stav | Podmínka | Zobrazení |
|---|---|---|
| **Online, čisto** | online, `pendingCount === 0` | nic (nebo decentní tečka) |
| **Offline, čisto** | offline, `pendingCount === 0` | trvalý badge „Offline režim" — čte se z cache, nic nečeká na odeslání |
| **Neuložená data** | `pendingCount > 0` | trvalý badge „N zápisů čeká na odeslání" (přebíjí stav Offline) |
| **Odesláno** | přechod `pendingCount > 0` → `0` po úspěšném flushi | jednorázový toast „N zápisů uloženo do databáze" |

Detaily:

- **Neuložená data** se zobrazují i online — flush může běžet nebo selhávat na
  5xx. Stav je „data nejsou v databázi", ne „nemám signál".
- **Toast** vypálit jen na hraně `>0 → 0`, a jen když flush skutečně uspěl.
  Vyprázdnění fronty odhozením 4xx položek musí hlásit chybu, ne úspěch.
  Sonner už je v projektu (`toast` v `ScoreForm`), použít ho.
- Badge `X/Y hlídek` v hlavičce počítá i pending položky, jinak to vypadá, že
  se zápis ztratil.
- `PatrolPicker` odliší hlídky s čekajícím zápisem (jiný odstín než odeslané).
- Detekce offline: `navigator.onLine` + `online`/`offline` eventy, ale u
  captive portálů lže — brát i vytimeoutovaný request (fáze 5) jako signál
  „offline".
