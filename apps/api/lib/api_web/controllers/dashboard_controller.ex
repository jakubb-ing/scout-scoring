defmodule ApiWeb.DashboardController do
  use ApiWeb, :controller

  alias Api.{Races, Scoring, AuditLog}

  defp owner(conn), do: conn.assigns.organizer["id"]

  def show(conn, %{"race_id" => rid}) do
    with {:ok, race} <- Races.get_race(rid, owner(conn)),
         {:ok, stations} <- Races.list_stations(rid, owner(conn)),
         {:ok, patrols} <- Races.list_patrols(rid, owner(conn)),
         {:ok, scores} <- Scoring.list_for_race(rid) do
      by_patrol = Enum.group_by(scores, & &1["patrol"])
      by_station = Enum.group_by(scores, & &1["station"])
      patrols_by_id = Map.new(patrols, &{&1["id"], &1})
      stations_by_id = Map.new(stations, &{&1["id"], &1})

      patrols_rows =
        Enum.map(patrols, fn p ->
          entries = Map.get(by_patrol, p["id"], [])
          total = sum_points(entries)

          %{
            id: p["id"],
            start_number: p["start_number"],
            name: p["name"],
            category: p["category"],
            stations_done: length(entries),
            total_points: total,
            last_activity: latest_ts(entries)
          }
        end)

      stations_rows =
        Enum.map(stations, fn s ->
          entries = Map.get(by_station, s["id"], [])

          %{
            id: s["id"],
            name: s["name"],
            position: s["position"],
            is_active: s["is_active"],
            patrols_processed: length(entries),
            pending: length(patrols) - length(entries)
          }
        end)

      activity_rows =
        scores
        |> Enum.map(fn score ->
          patrol = Map.get(patrols_by_id, score["patrol"], %{})
          station = Map.get(stations_by_id, score["station"], %{})

          %{
            id: score["id"],
            patrol_id: score["patrol"],
            patrol_name: patrol["name"],
            patrol_start_number: patrol["start_number"],
            station_id: score["station"],
            station_name: station["name"],
            station_position: station["position"],
            points: sum_points([score]),
            activity_at: score["updated_at"] || score["created_at"]
          }
        end)
        |> Enum.sort_by(&(&1.activity_at || ""), :desc)

      json(conn, %{
        race: race,
        patrols: patrols_rows,
        stations: stations_rows,
        activity: activity_rows
      })
    else
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def leaderboard(conn, %{"race_id" => rid}) do
    with {:ok, _} <- Races.get_race(rid, owner(conn)),
         {:ok, data} <- Scoring.leaderboard(rid) do
      json(conn, %{data: data})
    else
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def results(conn, %{"race_id" => rid}) do
    with {:ok, race} <- Races.get_race(rid, owner(conn)),
         {:ok, stations} <- Races.list_stations(rid, owner(conn)),
         {:ok, patrols} <- Races.list_patrols(rid, owner(conn)),
         {:ok, scores} <- Scoring.list_for_race(rid),
         {:ok, leaderboard} <- Scoring.leaderboard(rid),
         {:ok, feedback} <- Api.Feedback.list_records_for_race(rid) do
      json(conn, %{
        race: race,
        stations: stations,
        patrols: patrols,
        score_entries: scores,
        leaderboard: leaderboard,
        patrol_feedback: feedback
      })
    else
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def stats(conn, %{"race_id" => rid}) do
    with {:ok, race} <- Races.get_race(rid, owner(conn)),
         {:ok, stations} <- Races.list_stations(rid, owner(conn)),
         {:ok, patrols} <- Races.list_patrols(rid, owner(conn)),
         {:ok, categories} <- Races.list_categories(rid, owner(conn)),
         {:ok, scores} <- Scoring.list_for_race(rid) do
      cats_by_id = Map.new(categories, &{&1["id"], &1})
      scores_by_station = Enum.group_by(scores, & &1["station"])

      patrols_data =
        patrols
        |> Enum.sort_by(&(&1["start_number"] || 0))
        |> Enum.map(fn p ->
          cat = Map.get(cats_by_id, p["category"])

          %{
            id: p["id"],
            start_number: p["start_number"],
            name: p["name"],
            category_id: p["category"],
            category_name: if(cat, do: cat["name"], else: nil),
            category_scored: if(cat, do: cat["scored"] != false, else: true),
            withdrawn: p["withdrawn"] == true
          }
        end)

      time_tracking_enabled? = race["time_tracking"] in ["per_station", "start_finish"]

      stations_data =
        stations
        |> Enum.sort_by(&(&1["position"] || 0))
        |> Enum.map(fn s ->
          st_scores = Map.get(scores_by_station, s["id"], [])
          criteria = s["criteria"] || []

          max_points =
            criteria
            |> Enum.map(&(Map.get(&1, "max_points") || 0))
            |> Enum.sum()

          corrections_count =
            Enum.count(st_scores, &(!is_nil(&1["corrected_at"])))

          {queue_max, avg_dur} =
            if time_tracking_enabled? do
              compute_station_time_metrics(st_scores)
            else
              {nil, nil}
            end

          %{
            id: s["id"],
            name: s["name"],
            position: s["position"],
            point_step: s["point_step"] || 1.0,
            criteria: criteria,
            max_points: max_points,
            ops: %{
              corrections_count: corrections_count,
              queue_max_minutes: queue_max,
              avg_duration_minutes: avg_dur
            }
          }
        end)

      entries_data =
        Enum.map(scores, fn entry ->
          criteria_map =
            (entry["scores"] || [])
            |> Map.new(fn item -> {item["criterion"], item["points"]} end)

          total_points =
            (entry["scores"] || [])
            |> Enum.map(&(Map.get(&1, "points") || 0))
            |> Enum.sum()

          %{
            station_id: entry["station"],
            patrol_id: entry["patrol"],
            total_points: total_points,
            criteria: criteria_map,
            # Časy pro podzáložku Provoz. arrived_at/departed_at zadává
            # rozhodčí ručně a bývají prázdné; created_at je vždy.
            arrived_at: entry["arrived_at"],
            departed_at: entry["departed_at"],
            created_at: entry["created_at"],
            corrected_at: entry["corrected_at"]
          }
        end)

      json(conn, %{
        race: %{
          id: race["id"],
          name: race["name"],
          state: race["state"],
          time_tracking: race["time_tracking"]
        },
        stations: stations_data,
        patrols: patrols_data,
        categories: categories,
        entries: entries_data
      })
    else
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def audit(conn, %{"race_id" => rid} = params) do
    opts =
      [
        action: params["action"],
        limit: parse_int(params["limit"]),
        offset: parse_int(params["offset"])
      ]
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)

    with {:ok, _} <- Races.get_race(rid, owner(conn)),
         {:ok, logs} <- AuditLog.list_for_race(rid, opts) do
      json(conn, %{data: logs})
    else
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  defp compute_station_time_metrics(scores) do
    timed =
      scores
      |> Enum.map(fn s ->
        {parse_datetime(s["arrived_at"]), parse_datetime(s["departed_at"])}
      end)
      |> Enum.filter(fn {arr, dep} -> not is_nil(arr) and not is_nil(dep) end)

    if timed == [] do
      {nil, nil}
    else
      durations =
        timed
        |> Enum.map(fn {arr, dep} -> DateTime.diff(dep, arr, :second) end)
        |> Enum.filter(&(&1 >= 0))

      avg_dur =
        if durations != [] do
          Float.round(Enum.sum(durations) / length(durations) / 60.0, 1)
        else
          nil
        end

      sorted_by_arrival =
        Enum.sort_by(timed, fn {arr, _dep} -> DateTime.to_unix(arr, :second) end)

      {_last_dep, max_wait_sec} =
        Enum.reduce(sorted_by_arrival, {nil, 0}, fn {arr, dep}, {prev_dep, max_w} ->
          wait =
            if prev_dep && DateTime.compare(prev_dep, arr) == :gt do
              DateTime.diff(prev_dep, arr, :second)
            else
              0
            end

          new_prev_dep =
            if is_nil(prev_dep) do
              dep
            else
              if DateTime.compare(dep, prev_dep) == :gt, do: dep, else: prev_dep
            end

          {new_prev_dep, max(max_w, wait)}
        end)

      queue_max = Float.round(max_wait_sec / 60.0, 1)

      {queue_max, avg_dur}
    end
  end

  defp parse_datetime(nil), do: nil
  defp parse_datetime(%DateTime{} = dt), do: dt

  defp parse_datetime(iso) when is_binary(iso) do
    case DateTime.from_iso8601(iso) do
      {:ok, dt, _offset} ->
        dt

      _ ->
        case NaiveDateTime.from_iso8601(iso) do
          {:ok, ndt} -> DateTime.from_naive!(ndt, "Etc/UTC")
          _ -> nil
        end
    end
  end

  defp parse_datetime(_), do: nil

  defp parse_int(nil), do: nil

  defp parse_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {int, _} -> int
      _ -> nil
    end
  end

  defp parse_int(value) when is_integer(value), do: value
  defp parse_int(_), do: nil

  defp sum_points(entries) do
    entries
    |> Enum.flat_map(&(&1["scores"] || []))
    |> Enum.map(&(Map.get(&1, "points") || 0))
    |> Enum.sum()
  end

  defp latest_ts([]), do: nil

  defp latest_ts(entries),
    do: entries |> Enum.map(&(&1["updated_at"] || &1["created_at"])) |> Enum.max()
end
