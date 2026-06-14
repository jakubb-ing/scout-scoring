defmodule ApiWeb.PublicController do
  @moduledoc """
  Unauthenticated, read-only endpoints gated by a per-race access code
  (race.public_code). Lets organizers share a results link with anyone
  without handing out an account.
  """
  use ApiWeb, :controller

  alias Api.{Races, Scoring}

  plug ApiWeb.Plugs.RateLimit,
       [bucket: "public_results", limit: 30, window_ms: 60_000, by_param: "race_id"]
       when action in [:results]

  def results(conn, %{"race_id" => race_id} = params) do
    code = params["code"] || ""

    with {:ok, race} <- Races.verify_public_results_code(race_id, code),
         {:ok, stations} <- Races.list_stations_public_full(race_id),
         {:ok, patrols} <- Races.list_patrols_public(race_id),
         {:ok, scores} <- Scoring.list_for_race(race_id),
         {:ok, leaderboard} <- Scoring.leaderboard(race_id) do
      json(conn, %{
        race: race,
        stations: stations,
        patrols: patrols,
        score_entries: scores,
        leaderboard: leaderboard
      })
    else
      {:error, :invalid_code} -> conn |> put_status(401) |> json(%{error: "invalid_code"})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def results(conn, _), do: conn |> put_status(400) |> json(%{error: "missing_fields"})
end
