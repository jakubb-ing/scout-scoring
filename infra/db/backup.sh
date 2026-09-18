#!/usr/bin/env bash
#
# Logická záloha SurrealDB běžící na Fly.io.
#
# Snapshoty volume, které Fly dělá sám, chrání proti ztrátě disku — ne proti
# poškozeným datům nebo omylem smazanému závodu. Snapshot běžící RocksDB
# navíc nemusí být konzistentní. Tenhle export je ta záloha, na které
# doopravdy záleží.
#
# Použití:
#   SURREAL_PASS=... ./infra/db/backup.sh [cilovy_adresar]
#
# Záloha bez otestovaného obnovení není záloha. Postup obnovení je
# v docs/surrealdb-on-fly.md.

set -euo pipefail

APP="${SURREAL_APP:-db-scout-scoring}"
NS="${SURREAL_NS:-scout}"
DB="${SURREAL_DB:-scoring}"
USER="${SURREAL_USER:-root}"
OUT_DIR="${1:-./backups}"
PORT="${SURREAL_PROXY_PORT:-8001}"

if [[ -z "${SURREAL_PASS:-}" ]]; then
  echo "Chybí SURREAL_PASS. Heslo je ve správci hesel — 'flyctl secrets list'" >&2
  echo "ukazuje jen otisky, zpátky ho nedostaneš." >&2
  exit 1
fi

command -v surreal >/dev/null || { echo "Chybí surreal CLI." >&2; exit 1; }
command -v flyctl  >/dev/null || { echo "Chybí flyctl." >&2; exit 1; }

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/${DB}-${STAMP}.surql"

# Databáze nemá veřejnou IP, takže se k ní jde jen tunelem po privátní síti.
flyctl proxy "${PORT}:8000" -a "$APP" >/dev/null 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT

# Počkat, až tunel naběhne — bez toho export spadne na connection refused.
for _ in $(seq 1 30); do
  nc -z 127.0.0.1 "$PORT" 2>/dev/null && break
  sleep 0.5
done
nc -z 127.0.0.1 "$PORT" 2>/dev/null || { echo "Tunel na $APP nenaběhl." >&2; exit 1; }

surreal export \
  --endpoint "http://127.0.0.1:${PORT}" \
  --username "$USER" --password "$SURREAL_PASS" \
  --namespace "$NS" --database "$DB" \
  "$OUT"

# Prázdný nebo uříznutý export vypadá jako úspěch, dokud ho nepotřebuješ.
if [[ ! -s "$OUT" ]]; then
  echo "Export je prázdný — záloha NEVZNIKLA." >&2
  rm -f "$OUT"
  exit 1
fi

gzip -f "$OUT"
echo "Záloha: ${OUT}.gz ($(du -h "${OUT}.gz" | cut -f1))"

# Pozor: tohle zatím ukládá jen lokálně. Dokud zálohy neodcházejí mimo Fly
# (S3/R2), nechrání proti ztrátě celého účtu nebo volume.
