defmodule ApiWeb.RaceFlowAPITest do
  @moduledoc """
  HTTP vrstva průchodu závodem. Kontexty testujeme jinde — tady jde
  o to, že se chyby mapují na správné status kódy a že autorizace drží.
  """
  use Api.APICase, async: false

  setup %{conn: conn} do
    {race_id, organizer_id} = create_race()
    station_id = create_station(race_id, organizer_id)
    patrol_id = create_patrol(race_id, organizer_id)

    %{
      conn: as_organizer(conn, organizer_id),
      race_id: race_id,
      organizer_id: organizer_id,
      station_id: station_id,
      patrol_id: patrol_id
    }
  end

  describe "přechody stavů" do
    test "prepare vrátí 200 a vydá PINy", ctx do
      conn = post(ctx.conn, "/api/races/#{ctx.race_id}/prepare")

      assert %{"race" => race, "stations" => stations} = json_response(conn, 200)
      assert race["state"] == "ready"
      assert [%{"pin" => pin}] = stations
      assert String.length(pin) == 6
    end

    test "opakovaný prepare vrátí 409 race_not_draft", ctx do
      post(ctx.conn, "/api/races/#{ctx.race_id}/prepare")
      conn = post(ctx.conn, "/api/races/#{ctx.race_id}/prepare")

      assert %{"error" => "race_not_draft"} = json_response(conn, 409)
    end

    test "activate z draftu vrátí 409 race_not_ready", ctx do
      conn = post(ctx.conn, "/api/races/#{ctx.race_id}/activate")
      assert %{"error" => "race_not_ready"} = json_response(conn, 409)
    end

    test "celý průchod draft → ready → active → closed", ctx do
      assert json_response(post(ctx.conn, "/api/races/#{ctx.race_id}/prepare"), 200)
      assert json_response(post(ctx.conn, "/api/races/#{ctx.race_id}/activate"), 200)
      assert %{"state" => "closed"} = json_response(post(ctx.conn, "/api/races/#{ctx.race_id}/close"), 200)
    end

    test "unprepare z draftu vrátí 409 race_not_ready", ctx do
      conn = post(ctx.conn, "/api/races/#{ctx.race_id}/unprepare")
      assert %{"error" => "race_not_ready"} = json_response(conn, 409)
    end

    test "bez tokenu vrátí 401", ctx do
      conn = post(build_conn(), "/api/races/#{ctx.race_id}/prepare")
      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end

    test "s poškozeným tokenem vrátí 401", ctx do
      conn =
        build_conn()
        |> put_req_header("authorization", "Bearer nesmysl")
        |> post("/api/races/#{ctx.race_id}/prepare")

      assert json_response(conn, 401)
    end
  end

  describe "editace hlídky ve stavu ready" do
    setup ctx do
      post(ctx.conn, "/api/races/#{ctx.race_id}/prepare")
      ctx
    end

    test "změna názvu vrátí 200", ctx do
      conn =
        put(ctx.conn, "/api/patrols/#{ctx.patrol_id}", %{
          "name" => "Lišky",
          "members" => ["Jan"]
        })

      assert %{"name" => "Lišky"} = json_response(conn, 200)
    end

    test "změna startovního čísla vrátí 409 field_locked", ctx do
      patrol = reload(ctx.patrol_id)

      conn =
        put(ctx.conn, "/api/patrols/#{ctx.patrol_id}", %{
          "name" => patrol["name"],
          "start_number" => patrol["start_number"] + 50
        })

      assert %{"error" => "field_locked"} = json_response(conn, 409)
    end

    test "přidání hlídky vrátí 409 race_not_draft", ctx do
      conn =
        post(ctx.conn, "/api/races/#{ctx.race_id}/patrols", %{
          "name" => "Nová",
          "start_number" => 77
        })

      assert %{"error" => "race_not_draft"} = json_response(conn, 409)
    end
  end

  describe "stažení hlídky" do
    setup ctx do
      post(ctx.conn, "/api/races/#{ctx.race_id}/prepare")
      post(ctx.conn, "/api/races/#{ctx.race_id}/activate")
      ctx
    end

    test "withdraw bez důvodu projde", ctx do
      # FE posílá reason: null, když organizátor důvod nevyplní.
      conn = post(ctx.conn, "/api/patrols/#{ctx.patrol_id}/withdraw", %{"reason" => nil})

      assert %{"withdrawn" => true} = json_response(conn, 200)
    end

    test "withdraw s důvodem projde a restore ji vrátí", ctx do
      conn = post(ctx.conn, "/api/patrols/#{ctx.patrol_id}/withdraw", %{"reason" => "nepřijela"})
      assert json_response(conn, 200)

      conn = post(ctx.conn, "/api/patrols/#{ctx.patrol_id}/restore")
      assert %{"withdrawn" => false} = json_response(conn, 200)
    end

    test "withdraw v draftu vrátí 409", %{conn: conn} do
      {race_id, organizer_id} = create_race()
      patrol_id = create_patrol(race_id, organizer_id)

      conn =
        conn
        |> as_organizer(organizer_id)
        |> post("/api/patrols/#{patrol_id}/withdraw", %{"reason" => "brzy"})

      assert %{"error" => "race_not_running"} = json_response(conn, 409)
    end
  end

  describe "autorizace rolí" do
    setup ctx do
      reader = create_organizer()
      editor = create_organizer()

      {:ok, _} =
        Races.upsert_race_member(ctx.race_id, ctx.organizer_id, %{
          "organizer_id" => reader,
          "role" => "read"
        })

      {:ok, _} =
        Races.upsert_race_member(ctx.race_id, ctx.organizer_id, %{
          "organizer_id" => editor,
          "role" => "edit"
        })

      Map.merge(ctx, %{reader: reader, editor: editor})
    end

    test "člen s právem čtení nesmí připravit závod", ctx do
      conn =
        build_conn()
        |> as_organizer(ctx.reader)
        |> post("/api/races/#{ctx.race_id}/prepare")

      assert %{"error" => "forbidden"} = json_response(conn, 403)
    end

    test "člen s právem editace závod připravit smí", ctx do
      conn =
        build_conn()
        |> as_organizer(ctx.editor)
        |> post("/api/races/#{ctx.race_id}/prepare")

      assert json_response(conn, 200)
    end

    test "cizí organizátor závod ani nevidí", ctx do
      outsider = create_organizer()

      conn =
        build_conn()
        |> as_organizer(outsider)
        |> get("/api/races/#{ctx.race_id}")

      assert json_response(conn, 404)
    end

    test "člen s právem čtení nesmí stáhnout hlídku", ctx do
      post(ctx.conn, "/api/races/#{ctx.race_id}/prepare")
      post(ctx.conn, "/api/races/#{ctx.race_id}/activate")

      conn =
        build_conn()
        |> as_organizer(ctx.reader)
        |> post("/api/patrols/#{ctx.patrol_id}/withdraw", %{"reason" => "pokus"})

      assert %{"error" => "forbidden"} = json_response(conn, 403)
    end
  end
end
