defmodule Api.SurrealDB do
  @moduledoc """
  HTTP client for SurrealDB 3.x.

  Uses the `/rpc` JSON-RPC endpoint for parameterised queries (method:
  `"query"`, params: `[sql, vars]`) and the `/sql` text endpoint only for
  the bootstrap script that creates the namespace/database.

  Authentication: HTTP Basic with the configured root (or scoped) user.
  """

  require Logger

  @type query_result :: {:ok, list(any())} | {:error, term()}

  def query(sql, vars \\ %{}) when is_binary(sql) and is_map(vars) do
    cfg = config()

    body = %{
      "id" => 1,
      "method" => "query",
      "params" => [sql, vars]
    }

    headers = [
      {"Accept", "application/json"},
      {"Content-Type", "application/json"},
      {"Surreal-NS", cfg[:namespace]},
      {"Surreal-DB", cfg[:database]}
    ]

    measure("rpc", sql, fn ->
      Req.post(cfg[:url] <> "/rpc",
        headers: headers,
        auth: {:basic, "#{cfg[:user]}:#{cfg[:pass]}"},
        json: body,
        receive_timeout: 15_000
      )
    end)
    |> case do
      {:ok, %Req.Response{status: 200, body: %{"result" => results}}} when is_list(results) ->
        collect(results)

      {:ok, %Req.Response{status: 200, body: %{"error" => err}}} ->
        {:error, {:surreal, err}}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, {:http, status, body}}

      {:error, reason} ->
        {:error, {:transport, reason}}
    end
  end

  @doc "Run a query and return the first statement's first row (or nil)."
  def one(sql, vars \\ %{}) do
    case query(sql, vars) do
      {:ok, []} -> {:ok, nil}
      {:ok, [first | _]} -> {:ok, first}
      err -> err
    end
  end

  @doc "Alias for query/2 — returns flattened rows across all statements."
  def all(sql, vars \\ %{}), do: query(sql, vars)

  @doc """
  Run a raw SurrealQL script via the text `/sql` endpoint.

  Used for bootstrap (schema migration) where `$var` interpolation happens
  by us before sending, because `/sql` does NOT accept vars in the body.
  """
  def script(sql, vars \\ %{}) when is_binary(sql) do
    cfg = config()

    headers = [
      {"Accept", "application/json"},
      {"Content-Type", "text/plain"},
      {"Surreal-NS", cfg[:namespace]},
      {"Surreal-DB", cfg[:database]}
    ]

    measure("sql", sql, fn ->
      Req.post(cfg[:url] <> "/sql",
        headers: headers,
        auth: {:basic, "#{cfg[:user]}:#{cfg[:pass]}"},
        body: interpolate(sql, vars),
        receive_timeout: 30_000
      )
    end)
    |> case do
      {:ok, %Req.Response{status: 200, body: results}} when is_list(results) ->
        {:ok, results}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, {:http, status, body}}

      {:error, reason} ->
        {:error, {:transport, reason}}
    end
  end

  @doc """
  Build a `CREATE/UPDATE ... SET ...` fragment + cleaned vars map from a
  keyword list of `{field_atom, value}`. Nil values are dropped.

      iex> build_set(name: "X", held_on: nil, owner: "organizer:1")
      {"name = $name, owner = $owner", %{name: "X", owner: "organizer:1"}}
  """
  def build_set(fields) do
    kept = Enum.reject(fields, fn {_, v} -> is_nil(v) end)
    clause = Enum.map_join(kept, ", ", fn {k, _} -> "#{k} = $#{k}" end)
    vars = Map.new(kept)
    {clause, vars}
  end

  def health do
    case Req.get(config()[:url] <> "/health", receive_timeout: 2_000) do
      {:ok, %Req.Response{status: 200}} -> :ok
      other -> {:error, other}
    end
  end

  defp collect(results) do
    Enum.reduce_while(results, {:ok, []}, fn stmt, {:ok, acc} ->
      case stmt do
        %{"status" => "OK", "result" => rows} when is_list(rows) ->
          {:cont, {:ok, acc ++ rows}}

        %{"status" => "OK", "result" => value} ->
          {:cont, {:ok, acc ++ [value]}}

        %{"status" => "ERR", "result" => reason} ->
          {:halt, {:error, {:surreal, reason}}}

        other ->
          {:halt, {:error, {:unexpected, other}}}
      end
    end)
  end

  defp interpolate(sql, vars) when map_size(vars) == 0, do: sql

  defp interpolate(sql, vars) do
    Enum.reduce(vars, sql, fn {k, v}, acc ->
      String.replace(acc, "$" <> to_string(k), Jason.encode!(v))
    end)
  end

  defp config, do: Application.fetch_env!(:api, __MODULE__)

  # --- Instrumentace -------------------------------------------------------
  #
  # Cíl: rozdělit dobu odpovědi na (a) boot mašiny, (b) čekání na databázi,
  # (c) naši aplikaci. Tahle část měří (b). `ApiWeb.Plugs.RequestTiming`
  # posčítá dotazy v rámci jednoho requestu, `Api.SurrealDB.ConnTelemetry`
  # ukáže, jestli se TCP/TLS spojení recykluje, nebo se navazuje pokaždé
  # znovu (to by přidávalo 2 RTT na každý dotaz).

  @acc_key :surreal_timing

  defp measure(kind, sql, fun) do
    started = System.monotonic_time()
    result = fun.()
    us = System.convert_time_unit(System.monotonic_time() - started, :native, :microsecond)

    record(us)

    Logger.info(fn ->
      "surrealdb #{kind} #{div(us, 100) / 10}ms #{outcome(result)} #{summarize(sql)}"
    end)

    result
  end

  defp outcome({:ok, %Req.Response{status: status}}), do: "status=#{status}"
  defp outcome({:error, reason}), do: "transport_error=#{inspect(reason)}"
  defp outcome(_), do: "unknown"

  # První řádek dotazu, zkrácený — aby se v logu poznalo, o který dotaz jde,
  # ale neutekly do něj hodnoty ani celé migrační skripty.
  defp summarize(sql) do
    sql
    |> String.split("\n", parts: 2)
    |> hd()
    |> String.trim()
    |> String.slice(0, 120)
  end

  defp record(us) do
    {count, total} = Process.get(@acc_key, {0, 0})
    Process.put(@acc_key, {count + 1, total + us})
  end

  @doc """
  Kolik dotazů a kolik mikrosekund v nich strávil *tenhle* proces.

  Phoenix obsluhuje každý HTTP request ve vlastním procesu, takže je to
  přesně součet za jeden request. Vrací `{počet, mikrosekundy}`.
  """
  def timing_snapshot, do: Process.get(@acc_key, {0, 0})

  @doc "Vynuluje počítadlo pro tenhle proces."
  def reset_timing, do: Process.delete(@acc_key)
end
