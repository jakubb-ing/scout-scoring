defmodule ApiWeb.StationAPITest do
  @moduledoc """
  Endpointy rozhodčího a plug `AuthenticateStation`. Hlavní věc: token
  platný pro jiný stav závodu musí skončit jako 409 „závod neběží",
  ne jako 401 — jinak rozhodčí zbytečně shání nový QR kód.
  """
  use Api.APICase, async: false

  @criteria [%{"name" => "Provedení", "max_points" => 10}]

  setup %{conn: conn} do
    {race_id, organizer_id} = create_race(%{name: "Okresní kolo"})
    station_id = create_station(race_id, organizer_id, %{name: "Uzly", criteria: @criteria})
    patrol_id = create_patrol(race_id, organizer_id, %{name: "Tučňáci"})

    %{
      conn: conn,
      race_id: race_id,
      organizer_id: organizer_id,
      station_id: station_id,
      patrol_id: patrol_id
    }
  end

  defp prepare(ctx), do: {:ok, _} = Races.prepare_race(ctx.race_id, ctx.organizer_id)
  defp activate(ctx), do: {:ok, _} = Races.activate_race(ctx.race_id, ctx.organizer_id)

  describe "POST /api/station/login" do
    test "v ready vrátí 409 race_not_started i s platným PINem", ctx do
      prepare(ctx)
      pin = reload(ctx.station_id)["pin"]

      conn =
        post(ctx.conn, "/api/station/login", %{"station_id" => ctx.station_id, "pin" => pin})

      assert %{"error" => "race_not_started", "race_name" => "Okresní kolo", "state" => "ready"} =
               json_response(conn, 409)
    end

    test "v active vrátí token", ctx do
      prepare(ctx)
      activate(ctx)
      pin = reload(ctx.station_id)["pin"]

      conn =
        post(ctx.conn, "/api/station/login", %{"station_id" => ctx.station_id, "pin" => pin})

      assert %{"token" => token, "station" => %{"name" => "Uzly"}} = json_response(conn, 200)
      assert is_binary(token)
    end

    test "špatný PIN vrátí 401", ctx do
      prepare(ctx)
      activate(ctx)

      conn =
        post(ctx.conn, "/api/station/login", %{"station_id" => ctx.station_id, "pin" => "000000"})

      assert %{"error" => "invalid_station_pin"} = json_response(conn, 401)
    end

    test "po uzavření vrátí 409 race_closed", ctx do
      prepare(ctx)
      activate(ctx)
      pin = reload(ctx.station_id)["pin"]
      {:ok, _} = Races.close_race(ctx.race_id, ctx.organizer_id)

      conn =
        post(ctx.conn, "/api/station/login", %{"station_id" => ctx.station_id, "pin" => pin})

      assert %{"error" => "race_closed"} = json_response(conn, 409)
    end

    test "chybějící pole vrátí 400", ctx do
      conn = post(ctx.conn, "/api/station/login", %{"station_id" => ctx.station_id})
      assert %{"error" => "missing_fields"} = json_response(conn, 400)
    end
  end

  describe "plug AuthenticateStation" do
    test "bez tokenu vrátí 401", ctx do
      assert json_response(get(ctx.conn, "/api/station/me"), 401)
    end

    test "s platným tokenem vrátí stanoviště a hlídky", ctx do
      prepare(ctx)
      activate(ctx)

      conn = ctx.conn |> as_station(ctx.station_id) |> get("/api/station/me")

      assert %{"station" => %{"name" => "Uzly"}, "patrols" => [patrol]} = json_response(conn, 200)
      assert patrol["name"] == "Tučňáci"
    end

    test "token přežije návrat do ready, ale endpoint vrátí 409", ctx do
      prepare(ctx)
      activate(ctx)
      conn_with_token = as_station(ctx.conn, ctx.station_id)

      # závod se vrátí zpět — token je pořád podepsaný a nonce sedí
      {:ok, _} = SurrealDB.query("UPDATE $id SET state = 'ready';", %{id: ctx.race_id})

      assert %{"error" => "race_not_started"} = json_response(get(conn_with_token, "/api/station/me"), 409)
    end

    test "po resetu PINu starý token vrátí 401", ctx do
      prepare(ctx)
      activate(ctx)
      conn_with_token = as_station(ctx.conn, ctx.station_id)

      {:ok, _} = Races.reset_station_pin(ctx.station_id, ctx.organizer_id)

      assert json_response(get(conn_with_token, "/api/station/me"), 401)
    end

    test "deaktivované stanoviště token neprojde", ctx do
      prepare(ctx)
      activate(ctx)
      conn_with_token = as_station(ctx.conn, ctx.station_id)

      {:ok, _} = Races.deactivate_station(ctx.station_id, ctx.organizer_id)

      assert json_response(get(conn_with_token, "/api/station/me"), 401)
    end

    test "feedback token na station endpointu neprojde", ctx do
      prepare(ctx)
      activate(ctx)

      conn = ctx.conn |> as_patrol(ctx.patrol_id) |> get("/api/station/me")
      assert json_response(conn, 401)
    end
  end

  describe "POST /api/station/scores" do
    setup ctx do
      prepare(ctx)
      activate(ctx)
      Map.put(ctx, :conn, as_station(ctx.conn, ctx.station_id))
    end

    test "zapíše body a vrátí 200", ctx do
      conn =
        post(ctx.conn, "/api/station/scores", %{
          "patrol_id" => ctx.patrol_id,
          "scores" => [%{"criterion" => "Provedení", "points" => 8}]
        })

      assert %{"scores" => [%{"points" => 8}]} = json_response(conn, 200)
    end

    test "opakovaný zápis přepíše (upsert), nevznikne druhý záznam", ctx do
      body = fn points ->
        %{"patrol_id" => ctx.patrol_id, "scores" => [%{"criterion" => "Provedení", "points" => points}]}
      end

      post(ctx.conn, "/api/station/scores", body.(3))
      conn = post(ctx.conn, "/api/station/scores", body.(9))

      assert %{"scores" => [%{"points" => 9}]} = json_response(conn, 200)

      {:ok, entries} = Scoring.list_for_station(ctx.station_id)
      assert length(entries) == 1
    end

    test "po uzavření závodu vrátí 423 — offline fronta na tom stojí", ctx do
      {:ok, _} = Races.close_race(ctx.race_id, ctx.organizer_id)

      conn =
        post(ctx.conn, "/api/station/scores", %{
          "patrol_id" => ctx.patrol_id,
          "scores" => [%{"criterion" => "Provedení", "points" => 8}]
        })

      assert %{"error" => "race_closed"} = json_response(conn, 423)
    end

    test "hlídka z jiného závodu vrátí 422", ctx do
      {other_race, other_org} = create_race()
      foreign_patrol = create_patrol(other_race, other_org)

      conn =
        post(ctx.conn, "/api/station/scores", %{
          "patrol_id" => foreign_patrol,
          "scores" => []
        })

      assert json_response(conn, 422)
    end
  end
end
