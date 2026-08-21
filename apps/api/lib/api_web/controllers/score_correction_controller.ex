defmodule ApiWeb.ScoreCorrectionController do
  @moduledoc """
  Dodatečné opravy bodů organizátorem. Oddělená cesta od station zápisu —
  funguje výhradně u uzavřeného závodu a vždy s důvodem.
  """
  use ApiWeb, :controller

  alias Api.{Races, Scoring}

  defp owner(conn), do: conn.assigns.organizer["id"]

  def upsert(conn, %{"race_id" => race_id, "station_id" => station_id, "patrol_id" => patrol_id} = params) do
    organizer_id = owner(conn)

    with {:ok, _race} <- Races.ensure_race_edit(race_id, organizer_id),
         {:ok, entry} <-
           Scoring.correct_entry(
             race_id,
             station_id,
             patrol_id,
             params,
             organizer_id,
             params["reason"]
           ) do
      json(conn, entry)
    else
      {:error, :race_not_closed} -> conn |> put_status(409) |> json(%{error: "race_not_closed"})
      {:error, :reason_required} -> conn |> put_status(422) |> json(%{error: "reason_required"})
      {:error, :forbidden} -> conn |> put_status(403) |> json(%{error: "forbidden"})
      {:error, reason} -> conn |> put_status(422) |> json(%{error: inspect(reason)})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def upsert(conn, _), do: conn |> put_status(400) |> json(%{error: "missing_fields"})

  def delete(conn, %{"race_id" => race_id, "entry_id" => entry_id} = params) do
    organizer_id = owner(conn)

    with {:ok, _race} <- Races.ensure_race_edit(race_id, organizer_id),
         :ok <-
           Scoring.correct_delete(race_id, entry_id, organizer_id, params["reason"]) do
      send_resp(conn, 204, "")
    else
      {:error, :race_not_closed} -> conn |> put_status(409) |> json(%{error: "race_not_closed"})
      {:error, :reason_required} -> conn |> put_status(422) |> json(%{error: "reason_required"})
      {:error, :forbidden} -> conn |> put_status(403) |> json(%{error: "forbidden"})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end
end
