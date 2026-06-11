import Config

# Load variables from .env files (if present) before anything else in this
# file reads from the environment. Shell env always wins over file values.
# Files are optional; missing ones are silently skipped by Dotenvy.
if Code.ensure_loaded?(Dotenvy) do
  env_map =
    Dotenvy.source!([
      ".env",
      ".env.#{config_env()}",
      ".env.#{config_env()}.local",
      System.get_env()
    ])

  System.put_env(env_map)
end

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/api start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :api, ApiWeb.Endpoint, server: true
end

config :api, Api.SurrealDB,
  url: System.get_env("SURREAL_URL", "http://127.0.0.1:8000"),
  namespace: System.get_env("SURREAL_NS", "scout"),
  database: System.get_env("SURREAL_DB", "scoring"),
  user: System.get_env("SURREAL_USER", "root"),
  pass: System.get_env("SURREAL_PASS", "root")

if config_env() == :prod do
  # In production both signing secrets are mandatory. Without them the app
  # would silently fall back to the well-known dev defaults baked into
  # config.exs / StationToken, letting anyone forge organizer JWTs or station
  # tokens. Fail fast instead.
  guardian_secret =
    System.get_env("GUARDIAN_SECRET") ||
      raise """
      environment variable GUARDIAN_SECRET is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  config :api, Api.Auth.Guardian, secret_key: guardian_secret

  station_token_secret =
    System.get_env("STATION_TOKEN_SECRET") ||
      raise """
      environment variable STATION_TOKEN_SECRET is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  config :api, :station_token_secret, station_token_secret
else
  if guardian_secret = System.get_env("GUARDIAN_SECRET") do
    config :api, Api.Auth.Guardian, secret_key: guardian_secret
  end

  config :api,
         :station_token_secret,
         System.get_env("STATION_TOKEN_SECRET", "dev-station-secret-change-me")
end

if config_env() == :prod do
  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to check this value into version control, so we use an environment
  # variable instead.
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"
  port = String.to_integer(System.get_env("PORT") || "4000")

  config :api, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :api, ApiWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      # Enable IPv6 and bind on all interfaces.
      # Set it to  {0, 0, 0, 0, 0, 0, 0, 1} for local network only access.
      # See the documentation on https://hexdocs.pm/bandit/Bandit.html#t:options/0
      # for details about using IPv6 vs IPv4 and loopback vs public addresses.
      ip: {0, 0, 0, 0, 0, 0, 0, 0},
      port: port
    ],
    secret_key_base: secret_key_base

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :api, ApiWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         cipher_suite: :strong,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and more secure SSL ciphers. This means old browsers
  # and clients may not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:certfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://hexdocs.pm/plug/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :api, ApiWeb.Endpoint,
  #       force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in `force_ssl`.
end
