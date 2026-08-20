defmodule Api.MixProject do
  use Mix.Project

  def project do
    [
      app: :api,
      version: "0.1.0", # x-release-please-version
      elixir: "~> 1.14",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps()
    ]
  end

  # Configuration for the OTP application.
  #
  # Type `mix help compile.app` for more information.
  def application do
    [
      mod: {Api.Application, []},
      extra_applications: [:logger, :runtime_tools]
    ]
  end

  # Specifies which paths to compile per environment.
  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  # Specifies your project dependencies.
  #
  # Type `mix help deps` for examples and options.
  defp deps do
    [
      {:phoenix, "~> 1.7.14"},
      {:telemetry_metrics, "~> 1.0"},
      {:telemetry_poller, "~> 1.0"},
      {:jason, "~> 1.2"},
      {:dns_cluster, "~> 0.1.1"},
      {:bandit, "~> 1.5"},
      {:req, "~> 0.5"},
      {:guardian, "~> 2.3"},
      {:bcrypt_elixir, "~> 3.1"},
      {:corsica, "~> 2.1"},
      {:hammer, "~> 6.2"},
      {:uniq, "~> 0.6"},
      {:dotenvy, "~> 0.9"}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get"],
      "scout.migrate": ["run -e 'Api.DB.Migrate.run()'"],
      "scout.seed": ["run -e 'Api.DB.Seed.run()'"]
    ]
  end
end
