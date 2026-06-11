defmodule ApiWeb.StationController do
  @moduledoc "Station-facing endpoints used by judges in the field."
  use ApiWeb, :controller

  alias Api.{Auth.StationToken, Races, Scoring}

  plug ApiWeb.Plugs.RateLimit,
       [bucket: "station_login", limit: 10, window_ms: 60_000, by_param: "station_id"]
       when action in [:login]

  @station_token_ttl 72 * 60 * 60

  def login(conn, %{"station_id" => station_id, "pin" => pin}) do
    case Races.authenticate_station_pin(URI.decode(station_id), pin) do
      {:ok, station} ->
        race_id = station["race"]

        token =
          StationToken.sign(
            station["id"],
            race_id,
            station["access_token_hash"],
            @station_token_ttl
          )

        json(conn, %{
          token: token,
          station: %{
            id: station["id"],
            name: station["name"],
            race: race_id
          }
        })

      {:error, _} ->
        conn
        |> put_status(401)
        |> json(%{error: "invalid_station_pin"})
    end
  end

  def login(conn, _), do: conn |> put_status(400) |> json(%{error: "missing_fields"})

  def races(conn, _) do
    case Races.list_active_races_public() do
      {:ok, races} -> json(conn, %{data: races})
      _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def stations(conn, %{"race_id" => race_id}) do
    case Races.list_active_stations_public(race_id) do
      {:ok, stations} -> json(conn, %{data: stations})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def me(conn, _) do
    station = conn.assigns.station
    race_id = conn.assigns.race_id

    {:ok, patrols} = Races.list_patrols_public(race_id)

    json(conn, %{
      station: %{
        id: station["id"],
        name: station["name"],
        allow_half_points: station["allow_half_points"] == true,
        criteria: station["criteria"],
        race: race_id
      },
      patrols: patrols
    })
  end

  def list_entries(conn, _) do
    {:ok, entries} = Scoring.list_for_station(conn.assigns.station["id"])
    json(conn, %{data: entries})
  end

  def upsert_entry(conn, %{"patrol_id" => patrol_id} = params) do
    station = conn.assigns.station
    race_id = conn.assigns.race_id
    actor = conn.assigns.actor

    case Scoring.upsert_entry(race_id, station["id"], patrol_id, params, actor) do
      {:ok, entry} -> conn |> put_status(200) |> json(entry)
      {:error, :race_closed} -> conn |> put_status(423) |> json(%{error: "race_closed"})
      {:error, reason} -> conn |> put_status(422) |> json(%{error: inspect(reason)})
    end
  end
end
