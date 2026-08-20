defmodule ApiWeb.FeedbackController do
  @moduledoc "Endpoints for the patrol's accompanying adult (slovní zpětná vazba)."
  use ApiWeb, :controller

  alias Api.{Auth.FeedbackToken, Feedback}

  plug ApiWeb.Plugs.RateLimit,
       [bucket: "feedback_login", limit: 10, window_ms: 60_000, by_param: "patrol_id"]
       when action in [:login]

  @feedback_token_ttl 72 * 60 * 60

  def login(conn, %{"patrol_id" => patrol_id, "pin" => pin}) do
    case Feedback.authenticate_patrol_pin(URI.decode(patrol_id), pin) do
      {:ok, patrol} ->
        token =
          FeedbackToken.sign(
            patrol["id"],
            patrol["race"],
            patrol["feedback_nonce"],
            @feedback_token_ttl
          )

        json(conn, %{
          token: token,
          patrol: patrol_public(patrol),
          race: race_public(patrol),
          config: config_public(patrol)
        })

      {:error, {:race_not_started, patrol}} ->
        conn
        |> put_status(409)
        |> json(%{
          error: "race_not_started",
          race_name: patrol["race_name"],
          patrol_name: patrol["name"],
          state: patrol["race_state"]
        })

      {:error, :feedback_disabled} ->
        conn |> put_status(403) |> json(%{error: "feedback_disabled"})

      {:error, :feedback_window_closed} ->
        conn |> put_status(423) |> json(%{error: "feedback_window_closed"})

      {:error, _} ->
        conn |> put_status(401) |> json(%{error: "invalid_patrol_pin"})
    end
  end

  def login(conn, _), do: conn |> put_status(400) |> json(%{error: "missing_fields"})

  def me(conn, _) do
    patrol = conn.assigns.patrol

    case Feedback.get_record(patrol["id"]) do
      {:ok, record} ->
        json(conn, %{
          patrol: patrol_public(patrol),
          race: race_public(patrol),
          config: config_public(patrol),
          feedback: record_public(record),
          window_open: Feedback.ensure_feedback_open(patrol, record) == :ok
        })

      _ ->
        conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def draft(conn, params) do
    patrol = conn.assigns.patrol

    case Feedback.save_draft(
           patrol,
           List.wrap(params["positives"]),
           List.wrap(params["negatives"]),
           params["device_id"]
         ) do
      {:ok, record} ->
        json(conn, %{feedback: record_public(record)})

      {:error, {:locked_by_other_device, lock_at}} ->
        conn
        |> put_status(409)
        |> json(%{error: "locked_by_other_device", lock_at: lock_at})

      {:error, :feedback_submitted} ->
        conn |> put_status(423) |> json(%{error: "feedback_submitted"})

      {:error, :feedback_window_closed} ->
        conn |> put_status(423) |> json(%{error: "feedback_window_closed"})

      {:error, :missing_device} ->
        conn |> put_status(400) |> json(%{error: "missing_device"})

      _ ->
        conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def takeover(conn, params) do
    patrol = conn.assigns.patrol

    case Feedback.takeover(patrol, params["device_id"]) do
      {:ok, record} -> json(conn, %{feedback: record_public(record)})
      {:error, :missing_device} -> conn |> put_status(400) |> json(%{error: "missing_device"})
      {:error, :not_found} -> conn |> put_status(404) |> json(%{error: "not_found"})
      _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def submit(conn, params) do
    patrol = conn.assigns.patrol

    case Feedback.submit(patrol, params["device_id"]) do
      {:ok, record} ->
        json(conn, %{feedback: record_public(record)})

      {:error, {:locked_by_other_device, lock_at}} ->
        conn
        |> put_status(409)
        |> json(%{error: "locked_by_other_device", lock_at: lock_at})

      {:error, :feedback_submitted} ->
        conn |> put_status(423) |> json(%{error: "feedback_submitted"})

      {:error, :feedback_window_closed} ->
        conn |> put_status(423) |> json(%{error: "feedback_window_closed"})

      {:error, :not_found} ->
        conn |> put_status(404) |> json(%{error: "not_found"})

      _ ->
        conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  defp patrol_public(patrol) do
    %{
      id: patrol["id"],
      name: patrol["name"],
      start_number: patrol["start_number"]
    }
  end

  defp race_public(patrol) do
    %{
      id: patrol["race"],
      name: patrol["race_name"],
      state: patrol["race_state"],
      closed_at: patrol["race_closed_at"]
    }
  end

  defp config_public(patrol) do
    %{
      positive_count: patrol["feedback_positive_count"] || 0,
      negative_count: patrol["feedback_negative_count"] || 0
    }
  end

  defp record_public(nil), do: nil

  defp record_public(record) do
    %{
      id: record["id"],
      positives: record["positives"] || [],
      negatives: record["negatives"] || [],
      state: record["state"],
      submitted_at: record["submitted_at"],
      reopened_at: record["reopened_at"],
      reopen_count: record["reopen_count"] || 0,
      lock_device: record["lock_device"],
      lock_at: record["lock_at"]
    }
  end
end
