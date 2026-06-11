defmodule ApiWeb.Plugs.RateLimit do
  @moduledoc """
  Fixed-window rate limiter backed by Hammer (ETS).

  Used to throttle credential-guessing on the login endpoints. Limits per
  client IP and, optionally, per a target identifier taken from the request
  params (e.g. the station id or email being authenticated) so an attacker
  rotating source IPs can't brute-force a single account/PIN.

  Usage in a controller:

      plug ApiWeb.Plugs.RateLimit,
        [bucket: "station_login", limit: 10, window_ms: 60_000, by_param: "station_id"]
        when action in [:login]

  Fails open: if the Hammer backend errors we let the request through rather
  than locking everyone out.
  """
  import Plug.Conn
  require Logger

  def init(opts) do
    %{
      bucket: Keyword.fetch!(opts, :bucket),
      limit: Keyword.fetch!(opts, :limit),
      window_ms: Keyword.fetch!(opts, :window_ms),
      by_param: Keyword.get(opts, :by_param)
    }
  end

  def call(conn, %{bucket: bucket, limit: limit, window_ms: window_ms, by_param: by_param}) do
    keys =
      [bucket <> ":ip:" <> client_ip(conn)] ++ target_key(conn, bucket, by_param)

    if Enum.all?(keys, &allowed?(&1, window_ms, limit)) do
      conn
    else
      reject(conn, window_ms)
    end
  end

  defp allowed?(key, window_ms, limit) do
    case Hammer.check_rate(key, window_ms, limit) do
      {:allow, _count} ->
        true

      {:deny, _limit} ->
        false

      {:error, reason} ->
        Logger.error("RateLimit backend error for #{key}: #{inspect(reason)}")
        # Fail open — availability over strictness on backend failure.
        true
    end
  end

  defp target_key(conn, bucket, by_param) when is_binary(by_param) do
    case conn.params[by_param] do
      value when is_binary(value) and value != "" ->
        [bucket <> ":" <> by_param <> ":" <> value]

      _ ->
        []
    end
  end

  defp target_key(_conn, _bucket, _by_param), do: []

  defp reject(conn, window_ms) do
    conn
    |> put_resp_header("retry-after", Integer.to_string(div(window_ms, 1000)))
    |> put_resp_content_type("application/json")
    |> send_resp(429, Jason.encode!(%{error: "rate_limited"}))
    |> halt()
  end

  # Honour X-Forwarded-For (Fly.io / proxies put the real client first) and
  # fall back to the socket peer address.
  defp client_ip(conn) do
    case get_req_header(conn, "x-forwarded-for") do
      [value | _] when is_binary(value) ->
        value |> String.split(",") |> List.first() |> String.trim()

      _ ->
        conn.remote_ip |> :inet.ntoa() |> to_string()
    end
  end
end
