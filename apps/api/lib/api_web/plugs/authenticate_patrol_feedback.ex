defmodule ApiWeb.Plugs.AuthenticatePatrolFeedback do
  @moduledoc """
  Verifies the patrol-feedback token from `Authorization: Bearer …`.
  Loads patrol (with race fields) into conn.assigns.patrol.
  """
  import Plug.Conn

  alias Api.Auth.FeedbackToken
  alias Api.Feedback

  @max_age_seconds 72 * 60 * 60

  def init(opts), do: opts

  def call(conn, _opts) do
    token =
      case get_req_header(conn, "authorization") do
        [<<"Bearer ", t::binary>>] -> t
        _ -> conn.query_params["token"]
      end

    with token when is_binary(token) <- token,
         {:ok, %{patrol_id: pid, race_id: rid, nonce: nonce}} <-
           FeedbackToken.verify(token, @max_age_seconds),
         {:ok, patrol} <- Feedback.get_patrol_for_token(pid),
         true <- patrol["race"] == rid,
         true <- patrol["feedback_nonce"] == nonce,
         true <- patrol["feedback_enabled"] == true do
      case patrol["race_state"] do
        state when state in ["draft", "ready"] ->
          # Platný token, ale závod (znovu) neběží — stejný kód jako login,
          # ať FE ukáže „závod nebyl spuštěn", ne re-scan.
          conn
          |> put_resp_content_type("application/json")
          |> send_resp(
            409,
            Jason.encode!(%{
              error: "race_not_started",
              race_name: patrol["race_name"],
              patrol_name: patrol["name"],
              state: state
            })
          )
          |> halt()

        _ ->
          conn
          |> assign(:patrol, patrol)
          |> assign(:race_id, rid)
          |> assign(:actor, pid)
      end
    else
      _ ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(401, Jason.encode!(%{error: "unauthorized_patrol"}))
        |> halt()
    end
  end
end
