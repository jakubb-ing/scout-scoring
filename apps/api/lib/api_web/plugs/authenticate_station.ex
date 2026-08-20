defmodule ApiWeb.Plugs.AuthenticateStation do
  @moduledoc """
  Verifies the station token from the `Authorization: Bearer …` header.
  Loads station into conn.assigns.station and race into conn.assigns.race.
  """
  import Plug.Conn

  alias Api.Auth.StationToken
  alias Api.Races

  # Tokens valid for 24h past race end; we enforce at most 72h total life
  # as a defence-in-depth upper bound. Station deactivation invalidates
  # immediately via the DB check below.
  @max_age_seconds 72 * 60 * 60

  def init(opts), do: opts

  def call(conn, _opts) do
    token =
      case get_req_header(conn, "authorization") do
        [<<"Bearer ", t::binary>>] -> t
        _ -> conn.query_params["token"]
      end

    with token when is_binary(token) <- token,
         {:ok, %{station_id: sid, race_id: rid, nonce: nonce}} <-
           StationToken.verify(token, @max_age_seconds),
         {:ok, station} <- Races.get_station_for_login(sid),
         true <- station["race"] == rid,
         true <- station["access_token_hash"] == nonce do
      # Platný token, ale závod neběží (např. návrat active → ready):
      # stejný kód jako login, ať FE ukáže „závod nebyl spuštěn", ne re-scan.
      case station["race_state"] do
        "active" ->
          conn
          |> assign(:station, station)
          |> assign(:race_id, rid)
          |> assign(:actor, sid)

        state when state in ["draft", "ready"] ->
          conn
          |> put_resp_content_type("application/json")
          |> send_resp(
            409,
            Jason.encode!(%{
              error: "race_not_started",
              race_name: station["race_name"],
              station_name: station["name"],
              state: state
            })
          )
          |> halt()

        _ ->
          unauthorized(conn)
      end
    else
      _ -> unauthorized(conn)
    end
  end

  defp unauthorized(conn) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(401, Jason.encode!(%{error: "unauthorized_station"}))
    |> halt()
  end
end
