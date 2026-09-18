defmodule Api.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  require Logger

  @impl true
  def start(_type, _args) do
    Api.SurrealDB.ConnTelemetry.attach()

    maybe_run_migrations()
    maybe_run_seed()

    children = [
      ApiWeb.Telemetry,
      {DNSCluster, query: Application.get_env(:api, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Api.PubSub},
      # Start a worker by calling: Api.Worker.start_link(arg)
      # {Api.Worker, arg},
      # Start to serve requests, typically the last entry
      ApiWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Api.Supervisor]
    result = Supervisor.start_link(children, opts)

    # Značka pro odlišení cold startu: odstup mezi tímhle řádkem a prvním
    # `timing ...` řádkem je doba, kterou uživatel čekal na nabootování
    # mašiny, ne na aplikaci ani na databázi.
    Logger.info("api booted (uptime #{:erlang.statistics(:wall_clock) |> elem(0)}ms)")

    result
  end

  defp maybe_run_migrations do
    if Application.get_env(:api, :run_migrations_on_start, true) do
      case Api.DB.Migrate.run() do
        :ok ->
          :ok

        {:error, reason} ->
          Logger.error("SurrealDB migrations failed on startup: #{inspect(reason)}")
          raise "SurrealDB migrations failed: #{inspect(reason)}"
      end
    else
      Logger.debug("Skipping SurrealDB migrations on startup (:run_migrations_on_start=false)")
      :ok
    end
  end

  defp maybe_run_seed do
    if Application.get_env(:api, :run_seed_on_start, true) do
      case Api.DB.Seed.run() do
        :ok ->
          :ok

        {:error, reason} ->
          Logger.error("Seed failed on startup: #{inspect(reason)}")
          raise "Seed failed: #{inspect(reason)}"
      end
    else
      Logger.debug("Skipping seed on startup (:run_seed_on_start=false)")
      :ok
    end
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    ApiWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
