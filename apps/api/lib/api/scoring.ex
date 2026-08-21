defmodule Api.Scoring do
  @moduledoc """
  Score entries + leaderboard computation.

  Invariant: one score_entry per (station, patrol). Resubmit overwrites;
  the old state is captured in the audit_log.
  """

  alias Api.{SurrealDB, AuditLog}

  def get_entry(station_id, patrol_id) do
    sql = """
    SELECT * FROM score_entry
    WHERE station = $station AND patrol = $patrol
    LIMIT 1;
    """

    case SurrealDB.one(sql, %{station: station_id, patrol: patrol_id}) do
      {:ok, entry} when is_map(entry) -> {:ok, entry}
      _ -> {:error, :not_found}
    end
  end

  def list_for_station(station_id) do
    SurrealDB.all(
      "SELECT * FROM score_entry WHERE station = $station ORDER BY updated_at DESC;",
      %{station: station_id}
    )
  end

  def list_for_race(race_id) do
    SurrealDB.all(
      "SELECT * FROM score_entry WHERE race = $race;",
      %{race: race_id}
    )
  end

  @doc """
  Zápisy pro veřejnou výsledkovku. Nese `corrected_at` (odznak „upraveno"),
  ale ne `corrected_by` ani `correction_reason` — důvod je interní
  informace, která může zmiňovat konkrétní lidi.
  """
  def list_for_race_public(race_id) do
    with {:ok, entries} <- list_for_race(race_id) do
      {:ok, Enum.map(entries, &Map.drop(&1, ["corrected_by", "correction_reason", "submitted_by"]))}
    end
  end

  @doc """
  Upsert a score entry. `actor` is "organizer:<id>" or "station:<id>".
  Blocks writes if race is closed.
  """
  def upsert_entry(race_id, station_id, patrol_id, attrs, actor) do
    with :ok <- ensure_race_open(race_id),
         :ok <- ensure_patrol_belongs(race_id, patrol_id),
         :ok <- ensure_station_belongs(race_id, station_id) do
      before =
        case get_entry(station_id, patrol_id) do
          {:ok, e} -> e
          _ -> nil
        end

      {entry_result, action} =
        if before do
          {do_update(before["id"], attrs, actor), "score.update"}
        else
          {do_create(race_id, station_id, patrol_id, attrs, actor), "score.create"}
        end

      with {:ok, entry} when is_map(entry) <- entry_result do
        AuditLog.log(action, actor, race_id, station_id, %{
          patrol: patrol_id,
          before: before && before["scores"],
          after: entry["scores"]
        })

        {:ok, entry}
      end
    end
  end

  defp do_create(race_id, station_id, patrol_id, attrs, actor) do
    {set, vars} =
      SurrealDB.build_set(
        station: station_id,
        patrol: patrol_id,
        race: race_id,
        scores: attrs["scores"] || [],
        arrived_at: attrs["arrived_at"],
        departed_at: attrs["departed_at"]
      )

    sql = """
    CREATE score_entry SET #{set},
      submitted_by = type::string($actor),
      updated_at = time::now();
    """

    SurrealDB.one(sql, Map.put(vars, :actor, actor))
  end

  defp do_update(entry_id, attrs, actor) do
    {set, vars} =
      SurrealDB.build_set(
        scores: attrs["scores"] || [],
        arrived_at: attrs["arrived_at"],
        departed_at: attrs["departed_at"]
      )

    sql = """
    UPDATE $id SET #{set},
      submitted_by = type::string($actor),
      updated_at = time::now();
    """

    SurrealDB.one(sql, vars |> Map.put(:id, entry_id) |> Map.put(:actor, actor))
  end

  @doc """
  Dodatečná oprava bodů organizátorem — oddělená cesta, ne flag do
  `upsert_entry` (povolení by se nesmělo prosáknout do station cesty).
  Funguje výhradně u uzavřeného závodu a vyžaduje důvod.
  """
  def correct_entry(race_id, station_id, patrol_id, attrs, actor, reason) do
    with :ok <- ensure_race_closed(race_id),
         :ok <- ensure_reason(reason),
         :ok <- ensure_patrol_belongs(race_id, patrol_id),
         :ok <- ensure_station_belongs(race_id, station_id) do
      before =
        case get_entry(station_id, patrol_id) do
          {:ok, e} -> e
          _ -> nil
        end

      entry_result =
        if before do
          do_update(before["id"], attrs, actor)
        else
          do_create(race_id, station_id, patrol_id, attrs, actor)
        end

      with {:ok, entry} when is_map(entry) <- entry_result,
           {:ok, corrected} when is_map(corrected) <-
             SurrealDB.one(
               """
               UPDATE $id SET
                 corrected_at = time::now(),
                 corrected_by = type::string($actor),
                 correction_reason = $reason;
               """,
               %{id: entry["id"], actor: actor, reason: reason}
             ) do
        AuditLog.log("score.correct", actor, race_id, entry["id"], %{
          patrol: patrol_id,
          station: station_id,
          reason: reason,
          before: before && before["scores"],
          after: corrected["scores"],
          before_total: total_points(before),
          after_total: total_points(corrected),
          race_state: "closed"
        })

        {:ok, corrected}
      end
    end
  end

  @doc "Smazání záznamu v rámci opravy — také jen u uzavřeného závodu, s důvodem."
  def correct_delete(race_id, entry_id, actor, reason) do
    with :ok <- ensure_race_closed(race_id),
         :ok <- ensure_reason(reason),
         {:ok, before} when is_map(before) <-
           SurrealDB.one("SELECT * FROM $id WHERE race = $race;", %{id: entry_id, race: race_id}),
         {:ok, _} <- SurrealDB.query("DELETE $id;", %{id: entry_id}) do
      AuditLog.log("score.correct_delete", actor, race_id, entry_id, %{
        patrol: before["patrol"],
        station: before["station"],
        reason: reason,
        before: before["scores"],
        before_total: total_points(before),
        race_state: "closed"
      })

      :ok
    else
      {:ok, nil} -> {:error, :not_found}
      {:error, _} = err -> err
      _ -> {:error, :not_found}
    end
  end

  defp total_points(nil), do: nil

  defp total_points(entry) do
    (entry["scores"] || [])
    |> Enum.map(&(Map.get(&1, "points") || 0))
    |> Enum.sum()
  end

  defp ensure_reason(reason) when is_binary(reason) do
    if String.length(String.trim(reason)) >= 3, do: :ok, else: {:error, :reason_required}
  end

  defp ensure_reason(_), do: {:error, :reason_required}

  defp ensure_race_closed(race_id) do
    case SurrealDB.one("SELECT state FROM $id;", %{id: race_id}) do
      {:ok, %{"state" => "closed"}} -> :ok
      {:ok, %{"state" => _}} -> {:error, :race_not_closed}
      _ -> {:error, :not_found}
    end
  end

  def delete_entry(race_id, entry_id, actor) do
    with :ok <- ensure_race_open(race_id) do
      before = SurrealDB.one("SELECT * FROM $id;", %{id: entry_id})

      case SurrealDB.query("DELETE $id;", %{id: entry_id}) do
        {:ok, _} ->
          AuditLog.log("score.delete", actor, race_id, entry_id, %{before: before})
          :ok

        err ->
          err
      end
    end
  end

  @doc "Leaderboard per category for a race: patrol totals, sorted desc."
  def leaderboard(race_id) do
    # Get patrols + categories + scores; aggregate in memory. At MVP scale
    # (~25 patrols × ~15 stations) this is trivial and easier to reason
    # about than nested SurrealQL aggregation.
    with {:ok, patrols} <-
           SurrealDB.all(
             "SELECT * FROM patrol WHERE race = $race;",
             %{race: race_id}
           ),
         {:ok, categories} <-
           SurrealDB.all(
             "SELECT * FROM category WHERE race = $race;",
             %{race: race_id}
           ),
         {:ok, scores} <- list_for_race(race_id) do
      scores_by_patrol =
        Enum.group_by(scores, & &1["patrol"])

      # Stažené hlídky do pořadí nepatří — seděly by na konci s nulou.
      # Jejich score_entry v DB zůstávají (viz Races.withdraw_patrol).
      rows =
        patrols
        |> Enum.reject(&(&1["withdrawn"] == true))
        |> Enum.map(fn p ->
          patrol_scores = Map.get(scores_by_patrol, p["id"], [])

          total =
            patrol_scores
            |> Enum.flat_map(& &1["scores"])
            |> Enum.map(&(Map.get(&1, "points") || 0))
            |> Enum.sum()

          stations_done = length(patrol_scores)

          %{
            patrol_id: p["id"],
            start_number: p["start_number"],
            name: p["name"],
            category: p["category"],
            total_points: total,
            stations_done: stations_done
          }
        end)

      per_cat =
        categories
        |> Enum.map(fn c ->
          cat_rows =
            rows
            |> Enum.filter(&(&1.category == c["id"]))
            |> Enum.sort_by(& &1.total_points, :desc)
            |> assign_dense_rank()

          %{category_id: c["id"], category_name: c["name"], scored: c["scored"], rows: cat_rows}
        end)

      {:ok, per_cat}
    end
  end

  # Dense ranking: equal scores share a rank, next rank does not skip (1,2,2,3,4).
  defp assign_dense_rank(rows) do
    rows
    |> Enum.map_reduce({nil, 0}, fn r, {prev_pts, prev_rank} ->
      rank = if r.total_points == prev_pts, do: prev_rank, else: prev_rank + 1
      {Map.put(r, :rank, rank), {r.total_points, rank}}
    end)
    |> elem(0)
  end

  # ---------- guards ----------

  defp ensure_race_open(race_id) do
    case SurrealDB.one("SELECT state FROM $id;", %{id: race_id}) do
      {:ok, %{"state" => "closed"}} -> {:error, :race_closed}
      {:ok, %{"state" => _}} -> :ok
      _ -> {:error, :not_found}
    end
  end

  defp ensure_patrol_belongs(race_id, patrol_id) do
    case SurrealDB.one(
           "SELECT id FROM $id WHERE race = $race;",
           %{id: patrol_id, race: race_id}
         ) do
      {:ok, m} when is_map(m) -> :ok
      _ -> {:error, :patrol_not_in_race}
    end
  end

  defp ensure_station_belongs(race_id, station_id) do
    case SurrealDB.one(
           "SELECT id FROM $id WHERE race = $race;",
           %{id: station_id, race: race_id}
         ) do
      {:ok, m} when is_map(m) -> :ok
      _ -> {:error, :station_not_in_race}
    end
  end
end
