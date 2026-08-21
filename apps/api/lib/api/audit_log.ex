defmodule Api.AuditLog do
  @moduledoc "Append-only log of all mutations + auth events."

  alias Api.SurrealDB

  # Wrap string fields that may look like "table:id" with type::string to
  # prevent SurrealDB 3's auto-coercion to a record reference.
  def log(action, actor, race_id, entity, payload \\ %{}) do
    {set, vars} =
      SurrealDB.build_set(
        race: race_id,
        payload: payload
      )

    set =
      [
        set,
        "action = type::string($action)",
        "actor = type::string($actor)",
        "entity = type::string($entity)"
      ]
      |> Enum.reject(&(&1 == ""))
      |> Enum.join(", ")

    vars =
      vars
      |> Map.put(:action, to_string(action))
      |> Map.put(:actor, to_string(actor || "system"))
      |> Map.put(:entity, (entity && to_string(entity)) || "")

    SurrealDB.query("CREATE audit_log SET #{set};", vars)
  end

  @default_limit 200
  @max_limit 1000

  @doc """
  Výpis pro závod. `opts` přijímá `:action` (přesná shoda), `:limit`
  a `:offset` — export historie změn si musí umět dojít i za prvních 200
  záznamů, jinak by byl neúplný a nedal by se použít při námitce.
  """
  def list_for_race(race_id, opts \\ [])

  def list_for_race(race_id, limit) when is_integer(limit) do
    list_for_race(race_id, limit: limit)
  end

  def list_for_race(race_id, opts) when is_list(opts) do
    limit = opts |> Keyword.get(:limit, @default_limit) |> clamp(1, @max_limit)
    offset = opts |> Keyword.get(:offset, 0) |> clamp(0, 1_000_000)
    action = Keyword.get(opts, :action)

    {filter, vars} =
      case action do
        a when is_binary(a) and a != "" ->
          {" AND action = $action", %{race: race_id, action: a}}

        _ ->
          {"", %{race: race_id}}
      end

    SurrealDB.all(
      """
      SELECT * FROM audit_log
      WHERE race = $race#{filter}
      ORDER BY at DESC
      LIMIT #{limit} START #{offset};
      """,
      vars
    )
  end

  defp clamp(value, min, max) when is_integer(value), do: value |> max(min) |> min(max)
  defp clamp(_value, min, _max), do: min
end
