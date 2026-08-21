defmodule Api.DBCase do
  @moduledoc """
  Harness pro testy proti reálnému SurrealDB.

  SurrealDB nemá obdobu Ecto SQL sandboxu, takže izolace je hrubší:
  každý testový **modul** dostane vlastní databázi s náhodným jménem,
  na které se pustí migrace, a po doběhnutí se zahodí. Testy uvnitř
  modulu proto běží sériově (`async: false`) a sdílejí data — každý si
  musí zakládat vlastní záznamy přes `create_race/1` a spol.

  Použití:

      use Api.DBCase

  Testy jsou tagované `:db` a ve výchozím běhu vyloučené (viz
  `test_helper.exs`). Pouštějí se `mix test --include db` proti běžící
  instanci (`make db-local`).
  """

  use ExUnit.CaseTemplate

  alias Api.SurrealDB

  using do
    quote do
      @moduletag :db
      import Api.DBCase
      alias Api.{AuditLog, Feedback, Races, Scoring, SurrealDB}
    end
  end

  setup_all do
    original = Application.fetch_env!(:api, Api.SurrealDB)
    database = "test_#{System.unique_integer([:positive])}_#{:erlang.unique_integer([:positive])}"

    Application.put_env(:api, Api.SurrealDB, Keyword.put(original, :database, database))

    case ensure_reachable() do
      :ok ->
        :ok = Api.DB.Migrate.run()

        on_exit(fn ->
          # Databáze se zahazuje celá — levnější a spolehlivější než mazat
          # tabulky po jedné.
          SurrealDB.script("REMOVE DATABASE IF EXISTS #{database};")
          Application.put_env(:api, Api.SurrealDB, original)
        end)

        {:ok, database: database}

      {:error, reason} ->
        Application.put_env(:api, Api.SurrealDB, original)

        raise """
        SurrealDB není dostupná (#{inspect(reason)}).

        DB testy potřebují běžící instanci:

            make db-local

        Bez ní pouštěj jen `mix test` (DB testy jsou vyloučené ve výchozím běhu).
        """
    end
  end

  defp ensure_reachable do
    case SurrealDB.health() do
      :ok -> :ok
      other -> {:error, other}
    end
  end

  # ---------- factories ----------

  @doc "Založí organizátora a vrátí jeho id."
  def create_organizer(attrs \\ %{}) do
    email = Map.get(attrs, :email, "org-#{System.unique_integer([:positive])}@example.com")

    {:ok, organizer} =
      SurrealDB.one(
        "CREATE organizer SET email = $email, name = $name, password_hash = 'x';",
        %{email: email, name: Map.get(attrs, :name, "Organizátor")}
      )

    organizer["id"]
  end

  @doc "Založí závod ve stavu `draft` a vrátí `{race_id, organizer_id}`."
  def create_race(attrs \\ %{}) do
    organizer_id = Map.get_lazy(attrs, :organizer_id, fn -> create_organizer() end)

    {:ok, race} =
      Api.Races.create_race(organizer_id, %{
        "name" => Map.get(attrs, :name, "Závod #{System.unique_integer([:positive])}")
      })

    {race["id"], organizer_id}
  end

  @doc """
  Založí kategorii a vrátí její id. Jméno je unikátní — schéma má na
  (race, name) UNIQUE index.
  """
  def create_category(race_id, organizer_id, name \\ nil) do
    name = name || "Kategorie #{System.unique_integer([:positive])}"
    {:ok, category} = Api.Races.create_category(race_id, organizer_id, %{"name" => name})
    category["id"]
  end

  @doc "Založí hlídku (jen v draftu) a vrátí její id."
  def create_patrol(race_id, organizer_id, attrs \\ %{}) do
    category = Map.get_lazy(attrs, :category, fn -> create_category(race_id, organizer_id) end)

    {:ok, patrol} =
      Api.Races.create_patrol(race_id, organizer_id, %{
        "category" => category,
        "start_number" => Map.get(attrs, :start_number, System.unique_integer([:positive])),
        "name" => Map.get(attrs, :name, "Hlídka"),
        "members" => Map.get(attrs, :members, [])
      })

    patrol["id"]
  end

  @doc "Založí stanoviště (jen v draftu) a vrátí jeho id."
  def create_station(race_id, organizer_id, attrs \\ %{}) do
    {:ok, station} =
      Api.Races.create_station(race_id, organizer_id, %{
        "name" => Map.get(attrs, :name, "Uzly"),
        "position" => Map.get(attrs, :position, 1),
        "criteria" =>
          Map.get(attrs, :criteria, [
            %{"name" => "Provedení", "max_points" => 10}
          ])
      })

    station["id"]
  end

  @doc "Načte čerstvý záznam podle id."
  def reload(id) do
    {:ok, record} = SurrealDB.one("SELECT * FROM $id LIMIT 1;", %{id: id})
    record
  end

  @doc "Audit záznamy dané akce pro závod."
  def audit_entries(race_id, action) do
    {:ok, rows} = Api.AuditLog.list_for_race(race_id, action: action, limit: 100)
    rows
  end
end
