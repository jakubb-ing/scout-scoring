defmodule Api.SurrealDB.ConnTelemetry do
  @moduledoc """
  Odpovídá na otázku: recykluje se TCP/TLS spojení k SurrealDB, nebo se
  navazuje znovu pro každý dotaz?

  `Api.SurrealDB` posílá dotazy přes `Req`, tedy přes Finch. Finch spojení
  poolovat umí, ale jen dokud je pool živý a protistrana spojení nezavírá.
  Pokud SurrealDB Cloud posílá `Connection: close` nebo má krátký idle
  timeout, navazuje se TLS handshake pokaždé znovu — a to jsou dvě RTT
  navíc na každý dotaz. Při 20 ms do Irska je to rozdíl mezi 20 ms a 60 ms
  na dotaz, tedy trojnásobek. Tuhle příčinu je potřeba vyloučit dřív, než
  se začne řešit stěhování databáze, protože její oprava je o řád levnější.

  Log:

      surrealdb connect 42.1ms host=... (celkem 7 od startu)

  Pokud počet naskakuje zhruba stejně rychle jako počet dotazů, spojení se
  nerecykluje. Pokud zůstane stát na hrstce, pool funguje a pomalost je
  jinde.
  """

  require Logger

  @counter_key {__MODULE__, :connects}

  def attach do
    :persistent_term.put(@counter_key, :counters.new(1, [:write_concurrency]))

    :telemetry.attach(
      "surrealdb-conn-telemetry",
      [:finch, :connect, :stop],
      &__MODULE__.handle_event/4,
      nil
    )
  end

  def handle_event([:finch, :connect, :stop], measurements, metadata, _config) do
    if surreal_host?(metadata) do
      :counters.add(counter(), 1, 1)

      us = System.convert_time_unit(measurements[:duration] || 0, :native, :microsecond)

      Logger.info(fn ->
        "surrealdb connect #{div(us, 100) / 10}ms " <>
          "host=#{metadata[:host]}:#{metadata[:port]} " <>
          "(celkem #{connect_count()} od startu)"
      end)
    end
  end

  @doc "Kolik spojení k SurrealDB se navázalo od startu aplikace."
  def connect_count, do: :counters.get(counter(), 1)

  defp counter, do: :persistent_term.get(@counter_key)

  # Zajímají nás jen spojení k databázi, ne k ostatním službám (AI API apod.).
  defp surreal_host?(metadata) do
    case Application.fetch_env(:api, Api.SurrealDB) do
      {:ok, cfg} ->
        case URI.parse(cfg[:url] || "") do
          %URI{host: host} when is_binary(host) -> host == metadata[:host]
          _ -> false
        end

      :error ->
        false
    end
  end
end
