.PHONY: help db-local api-setup api-migrate api-seed api-server api-test test test-api test-db test-web version-show

help:
	@echo "Scout Scoring — monorepo"
	@echo ""
	@echo "  make db-local       Run SurrealDB 3.x locally on :8000 (root/root, RocksDB in /tmp)"
	@echo "  make api-setup      Install Elixir deps + compile"
	@echo "  make api-migrate    Create NS/DB + apply schema (idempotent)"
	@echo "  make api-seed       Create first organizer (SEED_EMAIL, SEED_PASS env)"
	@echo "  make api-server     Run Phoenix on :4000"
	@echo "  make api-test       Run API tests"
	@echo "  make test           All tests that do not need a database (api + web)"
	@echo "  make test-db        API tests against a running SurrealDB (make db-local)"
	@echo ""
	@echo "Prod: DB runs as a separate surrealdb instance (fly.io), configured via"
	@echo "SURREAL_URL / SURREAL_NS / SURREAL_DB / SURREAL_USER / SURREAL_PASS env vars."

db-local:
	@mkdir -p /tmp/scout-surreal
	surreal start --user root --pass root --bind 127.0.0.1:8000 --log info "rocksdb:/tmp/scout-surreal/scoring.db"

api-setup:
	cd apps/api && mix deps.get && mix compile

api-migrate:
	cd apps/api && mix scout.migrate

api-seed:
	cd apps/api && mix scout.seed

api-server:
	cd apps/api && mix phx.server

api-test: test-api

test-api:
	cd apps/api && mix test

# Potřebuje běžící SurrealDB — `make db-local` v druhém terminálu.
test-db:
	cd apps/api && mix test --include db

test-web:
	cd apps/web && npm test

test: test-api test-web

version-show:
	@printf "VERSION       %s\n" "$$(cut -d' ' -f1 VERSION)"
	@printf "mix.exs       %s\n" "$$(grep -o 'version: \"[^\"]*\"' apps/api/mix.exs | head -1 | cut -d'"' -f2)"
	@printf "package.json  %s\n" "$$(grep -o '\"version\": \"[^\"]*\"' apps/web/package.json | cut -d'"' -f4)"
