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
