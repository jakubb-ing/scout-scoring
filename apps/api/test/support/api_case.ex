defmodule Api.APICase do
  @moduledoc """
  Request testy přes celý stack (router → plugy → controller → DB).

  Staví na `Api.DBCase` (vlastní databáze na modul, migrace, úklid) a
  přidává `conn` a přihlašovací pomocníky. Testuje se to, co u kontextů
  vidět není: mapování chyb na status kódy a chování autentizačních plugů.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      use Api.DBCase
      use ApiWeb, :verified_routes

      import Plug.Conn
      import Phoenix.ConnTest
      import Api.APICase

      alias Api.Auth.{FeedbackToken, StationToken}

      @endpoint ApiWeb.Endpoint
    end
  end

  setup _tags do
    {:ok, conn: Phoenix.ConnTest.build_conn()}
  end

  @doc "Conn s JWT organizátora."
  def as_organizer(conn, organizer_id) do
    organizer = Api.Accounts.get_organizer(organizer_id)
    {:ok, token, _claims} = Api.Auth.Guardian.encode_and_sign(organizer)
    Plug.Conn.put_req_header(conn, "authorization", "Bearer " <> token)
  end

  @doc "Conn se station tokenem vydaným pro dané stanoviště."
  def as_station(conn, station_id) do
    station = Api.DBCase.reload(station_id)

    token =
      Api.Auth.StationToken.sign(
        station["id"],
        station["race"],
        station["access_token_hash"],
        3600
      )

    Plug.Conn.put_req_header(conn, "authorization", "Bearer " <> token)
  end

  @doc "Conn s feedback tokenem vydaným pro danou hlídku."
  def as_patrol(conn, patrol_id) do
    patrol = Api.DBCase.reload(patrol_id)

    token =
      Api.Auth.FeedbackToken.sign(
        patrol["id"],
        patrol["race"],
        patrol["feedback_nonce"],
        3600
      )

    Plug.Conn.put_req_header(conn, "authorization", "Bearer " <> token)
  end
end
