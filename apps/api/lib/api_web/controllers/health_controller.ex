defmodule ApiWeb.HealthController do
  use ApiWeb, :controller

  def show(conn, _) do
    db =
      case Api.SurrealDB.health() do
        :ok -> "ok"
        _ -> "down"
      end

    json(conn, %{
      status: "ok",
      db: db,
      version: Application.spec(:api, :vsn) |> to_string()
    })
  end
end
