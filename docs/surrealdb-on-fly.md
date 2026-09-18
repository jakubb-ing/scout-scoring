# SurrealDB na Fly.io

Postup přesunu databáze ze Surreal Cloud (Dublin) na vlastní instanci na
Fly.io ve Frankfurtu, ve stejném regionu jako API.

## Proč

Měření z produkce (instrumentace v `Api.SurrealDB` a
`ApiWeb.Plugs.RequestTiming`, viz commit „perf: measure where response time
actually goes"): jeden triviální `SELECT` přes už navázané spojení trvá
**63–144 ms, medián ~85 ms**, zatímco naše vlastní kód spotřebuje 0,1 ms.

Čistá síťová odezva Frankfurt↔Dublin je ~20 ms. Zbylých ~65 ms se tráví
uvnitř Surreal Cloud. **Geografie je tedy zhruba čtvrtina problému** —
hlavní zisk z tohohle přesunu není zkrácení trasy, ale odchod z pomalé
sdílené instance. Je dobré to vědět dopředu, aby výsledek nezklamal: pokud
po přesunu klesne medián z 85 ms na jednotky ms, byla za to zodpovědná
instance, ne vzdálenost.

## Co to stojí

Za tohle rozhodnutí se platí provozem. Managed služba se vyměňuje za jeden
node, který:

- **nemá HA** — jedna mašina, jedno volume; skutečná HA u SurrealDB znamená
  TiKV backend, což je úplně jiná liga složitosti,
- **má výpadek při každém deployi databáze** (volume umí připojit jen jedna
  mašina, takže `strategy = 'immediate'`) — proto se DB nedeployuje během
  závodu,
- **se zálohuje sám** a záloha bez otestovaného obnovení není záloha.

U aplikace, kde ztráta dat znamená ztracené výsledky závodu, je krok
„otestovat obnovení" povinný, ne volitelný.

## Příprava

Ověřené předpoklady (stav k 18. 9. 2026):

| Věc | Hodnota | Jak ověřeno |
|---|---|---|
| Verze na Cloudu | `surrealdb-3.2.4` | `GET /version` |
| Image pro Fly | `surrealdb/surrealdb:v3.2.4` | existuje na Docker Hubu |
| Objem dat | hluboko pod 1 GB | kvóta 1 GB zatím nevyčerpaná |
| Konfigurace v kódu | jen env proměnné | `config/runtime.exs:51-56` |

Poslední řádek je důležitý: **přepnutí databáze nevyžaduje změnu kódu**,
jen jiné hodnoty `SURREAL_URL` / `SURREAL_NS` / `SURREAL_DB` /
`SURREAL_USER` / `SURREAL_PASS`.

### Lokální CLI musí sedět s verzí serveru

```sh
surreal version      # musí hlásit 3.2.x
```

Pokud hlásí starší (např. 3.0.0), povyš ho dřív, než sáhneš na export:

```sh
brew upgrade surrealdb/tap/surreal   # nebo: curl -sSf https://install.surrealdb.com | sh
```

Export starším klientem z novějšího serveru je zdroj tichých ztrát.

## 1. Vytvoření aplikace a volume

```sh
flyctl apps create db-scout-scoring --org personal

# Volume ve stejném regionu jako API. 3 GB dává prostor datům, exportům
# i RocksDB compaction, která si při práci alokuje navíc.
flyctl volumes create scout_db_data --app db-scout-scoring --region fra --size 3

# Root přihlášení. Heslo vygeneruj, nevymýšlej.
flyctl secrets set --app db-scout-scoring \
  SURREAL_USER=root \
  SURREAL_PASS="$(openssl rand -base64 32)"
```

Heslo si ulož do správce hesel — `flyctl secrets list` ukazuje jen otisky,
zpátky ho nedostaneš.

## 2. Nasazení

```sh
flyctl deploy -c infra/db/fly.toml
flyctl status -a db-scout-scoring        # health check musí být „passing"
```

Databáze **nedostane veřejnou IP** — `infra/db/fly.toml` záměrně nemá
sekci `[http_service]`. Je dosažitelná jen po privátní síti Fly na
`db-scout-scoring.internal:8000`.

## 3. Ověření dosažitelnosti z API

Tohle je krok, který se nejčastěji přeskočí a pak se hledá hodinu:

```sh
flyctl ssh console -a api-scout-scoring -C \
  "/app/bin/api rpc 'IO.inspect(:inet.getaddrs(~c\"db-scout-scoring.internal\", :inet6))'"
```

Privátní síť Fly (6PN) jezdí **výhradně po IPv6**, `*.internal` má jen AAAA
záznam. Mint (pod `Req`/`Finch`) má `inet6` ve výchozím stavu vypnuté a na
takovou adresu by se vůbec nepřipojil. `Api.SurrealDB` proto posílá
`connect_options: [transport_opts: [inet6: true]]` — zkusí IPv6 a při
neúspěchu spadne zpět na IPv4, takže totéž nastavení funguje i proti
localhostu ve vývoji.

## 4. Přenos dat

Během tohohle kroku se do aplikace nesmí zapisovat. Naplánuj ho mimo závod.

```sh
# Proměnné pro starý Cloud — hodnoty vezmi ze správce hesel.
export OLD_URL="https://jacob-instance-....aws-euw1.surreal.cloud"
export OLD_USER=root OLD_PASS="..."

# Export
surreal export --endpoint "$OLD_URL" --username "$OLD_USER" --password "$OLD_PASS" \
  --namespace scout --database scoring ./scout-export.surql

wc -l ./scout-export.surql       # nesmí být prázdné
grep -c "^INSERT\|^CREATE" ./scout-export.surql

# Import do nové instance přes proxy na privátní síť
flyctl proxy 8001:8000 -a db-scout-scoring &

surreal import --endpoint http://127.0.0.1:8001 \
  --username root --password "$NEW_PASS" \
  --namespace scout --database scoring ./scout-export.surql
```

Migrace schématu se pouští sama při startu API (`release_command` v
`apps/api/fly.toml`), ale na prázdné databázi je pořádek si ji ověřit:

```sh
surreal sql --endpoint http://127.0.0.1:8001 --username root --password "$NEW_PASS" \
  --namespace scout --database scoring --pretty <<'SQL'
INFO FOR DB;
SELECT count() FROM race GROUP ALL;
SQL
```

Počty porovnej se starou instancí **předtím, než přepneš aplikaci**.

## 5. Přepnutí aplikace

```sh
flyctl secrets set --app api-scout-scoring \
  SURREAL_URL="http://db-scout-scoring.internal:8000" \
  SURREAL_PASS="$NEW_PASS"
```

Nastavení secrets samo vyvolá redeploy. `http://`, ne `https://` — uvnitř
6PN je provoz šifrovaný na úrovni sítě a TLS by jen přidalo handshake,
kvůli kterému se celá akce dělá.

### Ověření, že to zabralo

```sh
flyctl logs -a api-scout-scoring | grep -E "timing |surrealdb "
```

V logu má být `db=` v jednotkách milisekund místo dosavadních ~85 ms.
Pokud ne, přesun problém nevyřešil a instrumentace řekne proč — nepokračuj
v mazání staré instance, dokud čísla nesedí.

## 6. Zálohy

**Starou instanci na Surreal Cloud nech běžet aspoň týden.** Je to jediná
cesta zpátky, dokud si nová neodslouží jeden celý závod.

Zálohy jsou dvě vrstvy:

- **Snapshoty volume** dělá Fly sám denně (`flyctl volumes snapshots list
  scout_db_data`). Chrání proti ztrátě disku, ne proti poškození dat —
  snapshot běžící RocksDB nemusí být konzistentní.
- **Logické exporty** přes `infra/db/backup.sh`. Tohle je ta záloha, na
  které ve skutečnosti záleží.

Obnovení otestuj hned, ne až bude potřeba:

```sh
./infra/db/backup.sh                     # vytvoří export
# a zkus ho nahrát do prázdné lokální databáze
```

## Co zbývá dořešit

- Kam odkládat exporty mimo Fly (S3/R2) — dokud leží jen na tom samém
  volume, nechrání proti jeho ztrátě.
- Alert na docházející místo na volume.
- Jak se zachovat, když mašina s databází umře uprostřed závodu. Zatím je
  odpověď „ruční obnovení ze zálohy", a to je potřeba mít napsané dřív, než
  to nastane.
