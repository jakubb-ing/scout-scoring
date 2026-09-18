#!/usr/bin/env bash
#
# Přenos dat ze Surreal Cloud na instanci běžící na Fly.io.
#
# Nepřepíná aplikaci. Když doběhne, data jsou na obou místech a API pořád
# čte ze starého Cloudu — přepnutí je vědomý druhý krok, viz výpis na konci.
#
# Jede přes HTTP endpointy /export a /import, ne přes `surreal` CLI. Tím
# odpadá požadavek, aby lokální CLI verzí sedělo se serverem (export starším
# klientem z novějšího serveru je zdroj tichých ztrát).
#
# Použití:
#   OLD_URL="https://....surreal.cloud" OLD_PASS='...' NEW_PASS='...' \
#     ./infra/db/migrate-from-cloud.sh
#
# Během běhu se do aplikace nesmí zapisovat. Pusť to mimo závod.

set -euo pipefail

NS="${SURREAL_NS:-scout}"
DB="${SURREAL_DB:-scoring}"
OLD_USER="${OLD_USER:-root}"
NEW_USER="${NEW_USER:-root}"
NEW_APP="${SURREAL_APP:-db-scout-scoring}"
PORT="${SURREAL_PROXY_PORT:-8001}"
OUT_DIR="${OUT_DIR:-./backups}"

for v in OLD_URL OLD_PASS NEW_PASS; do
  [[ -n "${!v:-}" ]] || { echo "Chybí proměnná $v." >&2; exit 1; }
done
command -v flyctl >/dev/null || { echo "Chybí flyctl." >&2; exit 1; }
command -v jq     >/dev/null || { echo "Chybí jq." >&2; exit 1; }

OLD_URL="${OLD_URL%/}"
NEW_URL="http://127.0.0.1:${PORT}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$OUT_DIR/cloud-${DB}-${STAMP}.surql"

# Spočítá záznamy v každé tabulce. Tenhle výstup je jediný způsob, jak
# poznat, že se přeneslo všechno — „import doběhl bez chyby" to neznamená.
counts() {
  local url="$1" user="$2" pass="$3"
  local tables
  tables=$(curl -fsS --max-time 30 -X POST "$url/rpc" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -H "Surreal-NS: $NS" -H "Surreal-DB: $DB" -u "$user:$pass" \
    -d '{"id":1,"method":"query","params":["INFO FOR DB"]}' \
    | jq -r '.result[0].result.tables // {} | keys[]' 2>/dev/null) || return 1
  [[ -z "$tables" ]] && return 0
  local q=""
  for t in $tables; do q+="SELECT count() FROM ${t} GROUP ALL;"; done
  local res
  res=$(curl -fsS --max-time 60 -X POST "$url/rpc" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -H "Surreal-NS: $NS" -H "Surreal-DB: $DB" -u "$user:$pass" \
    -d "$(jq -nc --arg q "$q" '{id:1,method:"query",params:[$q]}')")
  paste -d' ' \
    <(printf '%s\n' $tables) \
    <(echo "$res" | jq -r '.result[] | (.result[0].count // 0)')
}

echo "==> 1/5  Export ze Surreal Cloud"
curl -fsS --max-time 600 \
  -H 'Accept: application/json' -H "Surreal-NS: $NS" -H "Surreal-DB: $DB" \
  -u "$OLD_USER:$OLD_PASS" "$OLD_URL/export" -o "$DUMP"

# Prázdný nebo uříznutý export vypadá jako úspěch, dokud ho nepotřebuješ.
[[ -s "$DUMP" ]] || { echo "Export je prázdný — končím, nic se neimportovalo." >&2; exit 1; }
echo "    $DUMP ($(du -h "$DUMP" | cut -f1), $(wc -l < "$DUMP") řádků)"

echo "==> 2/5  Počty záznamů na Cloudu"
OLD_COUNTS="$(counts "$OLD_URL" "$OLD_USER" "$OLD_PASS" || true)"
echo "${OLD_COUNTS:-    (žádné tabulky)}" | sed 's/^/    /'

echo "==> 3/5  Tunel na $NEW_APP"
flyctl proxy "${PORT}:8000" -a "$NEW_APP" >/tmp/migrate-proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do nc -z 127.0.0.1 "$PORT" 2>/dev/null && break; sleep 0.5; done
nc -z 127.0.0.1 "$PORT" 2>/dev/null || { echo "Tunel nenaběhl." >&2; exit 1; }
sleep 2

# Import do neprázdné databáze by data míchal, ne nahrazoval.
EXISTING="$(counts "$NEW_URL" "$NEW_USER" "$NEW_PASS" 2>/dev/null | awk '{s+=$2} END{print s+0}')"
if [[ "${EXISTING:-0}" -gt 0 ]]; then
  echo "Cílová databáze už obsahuje $EXISTING záznamů. Import by je smíchal" >&2
  echo "s importovanými. Vyprázdni ji, nebo si rozmysli, co chceš." >&2
  exit 1
fi

echo "==> 4/5  Import do Fly"
curl -fsS --max-time 900 -X POST \
  -H 'Content-Type: text/plain' -H 'Accept: application/json' \
  -H "Surreal-NS: $NS" -H "Surreal-DB: $DB" \
  -u "$NEW_USER:$NEW_PASS" --data-binary "@$DUMP" "$NEW_URL/import" >/dev/null

echo "==> 5/5  Porovnání"
NEW_COUNTS="$(counts "$NEW_URL" "$NEW_USER" "$NEW_PASS" || true)"
printf '    %-22s %10s %10s  %s\n' TABULKA CLOUD FLY ""
RC=0
while read -r t c; do
  [[ -z "$t" ]] && continue
  n=$(echo "$NEW_COUNTS" | awk -v t="$t" '$1==t{print $2}')
  n="${n:-0}"
  if [[ "$c" == "$n" ]]; then mark="ok"; else mark="NESEDÍ"; RC=1; fi
  printf '    %-22s %10s %10s  %s\n' "$t" "$c" "$n" "$mark"
done <<< "$OLD_COUNTS"

if [[ "$RC" -ne 0 ]]; then
  echo ""
  echo "Počty nesedí. NEPŘEPÍNEJ aplikaci. Export zůstal v $DUMP." >&2
  exit 1
fi

cat <<NEXT

Data sedí. Aplikace pořád čte ze Surreal Cloud — přepneš ji takhle:

  flyctl secrets set --app api-scout-scoring \\
    SURREAL_URL="http://db-scout-scoring.internal:8000" \\
    SURREAL_PASS='<NEW_PASS>'

Pak sleduj, jestli se to povedlo:

  flyctl logs -a api-scout-scoring | grep -E "timing |surrealdb "

V logu má být db= v jednotkách ms místo dosavadních ~85 ms. Starou instanci
na Cloudu nech běžet aspoň týden — je to jediná cesta zpátky.
NEXT
