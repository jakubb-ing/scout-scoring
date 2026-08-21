import Config

# Do not print debug messages in production
config :logger, level: :info

# Schéma mění výhradně `release_command` z fly.toml (běží jednou, na jednom
# stroji, před spuštěním nové verze — a když selže, deploy se neprovede).
# Kdyby migrace běžely i při startu, dva souběžně startující stroje by si
# navzájem shodily zápis do `_migration` (UNIQUE index na názvu).
config :api, run_migrations_on_start: false

# Seed zakládá prvního organizátora z SEED_* proměnných a bez nich by na
# produkci vytvořil účet s veřejně známým heslem. Pouští se ručně, jednou:
#   fly ssh console -C "/app/bin/api eval 'Api.DB.Seed.run()'"
config :api, run_seed_on_start: false

# Runtime production configuration, including reading
# of environment variables, is done on config/runtime.exs.
