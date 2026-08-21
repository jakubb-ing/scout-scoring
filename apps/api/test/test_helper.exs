# DB testy potřebují běžící SurrealDB, takže ve výchozím běhu nejedou.
# Pouštějí se `mix test --include db` (viz docs/testing-plan.md).
ExUnit.start(exclude: [:db])
