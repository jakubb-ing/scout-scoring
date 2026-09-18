defmodule ApiWeb.Plugs.RequestTiming do
  @moduledoc """
  Rozpadne dobu každého requestu na čas strávený v databázi a čas ve vlastní
  aplikaci.

  Log vypadá takhle:

      timing GET /api/races 200 total=143.2ms db=128.7ms(4) app=14.5ms

  `db=` je součet doby všech volání `Api.SurrealDB` v tomhle requestu,
  v závorce jejich počet. `app=` je zbytek — serializace, autentizace, naše
  logika. Když je `db` drtivá většina `total` a počet dotazů malý, sedí
  hypotéza o síťové latenci k Irsku. Když je dotazů hodně, problém je
  v jejich počtu, ne v jejich vzdálenosti. Když je velké `app`, je problém
  jinde a stěhování databáze nepomůže.

  Měří se až od vstupu do plugu, takže boot mašiny se sem nezapočítá — ten
  se pozná z odstupu mezi `Running ...` v logu Fly a prvním `timing` řádkem.
  """

  require Logger

  @behaviour Plug

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    Api.SurrealDB.reset_timing()
    started = System.monotonic_time()

    Plug.Conn.register_before_send(conn, fn conn ->
      total_us =
        System.convert_time_unit(System.monotonic_time() - started, :native, :microsecond)

      {count, db_us} = Api.SurrealDB.timing_snapshot()

      Logger.info(fn ->
        "timing #{conn.method} #{conn.request_path} #{conn.status} " <>
          "total=#{ms(total_us)}ms db=#{ms(db_us)}ms(#{count}) " <>
          "app=#{ms(max(total_us - db_us, 0))}ms"
      end)

      conn
    end)
  end

  defp ms(us), do: div(us, 100) / 10
end
