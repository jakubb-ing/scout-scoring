defmodule ApiWeb.FeedbackAPITest do
  @moduledoc """
  Endpointy doprovodu a organizátora nad zpětnou vazbou. Klíčové je, že
  konflikt zámku je 409 (offline fronta ho pak umí nabídnout k převzetí)
  a vypršené okno 423.
  """
  use Api.APICase, async: false

  @device_a "device-a"
  @device_b "device-b"

  setup %{conn: conn} do
    {race_id, organizer_id} = create_race(%{name: "Okresní kolo"})
    create_station(race_id, organizer_id)
    patrol_id = create_patrol(race_id, organizer_id, %{name: "Tučňáci"})

    {:ok, _} = Races.update_race(race_id, organizer_id, %{"feedback_enabled" => true})
    {:ok, _} = Races.prepare_race(race_id, organizer_id)
    {:ok, _} = Races.activate_race(race_id, organizer_id)

    %{conn: conn, race_id: race_id, organizer_id: organizer_id, patrol_id: patrol_id}
  end

  describe "POST /api/feedback/login" do
    test "se správným PINem vrátí token a konfiguraci polí", ctx do
      pin = reload(ctx.patrol_id)["feedback_pin"]

      conn =
        post(ctx.conn, "/api/feedback/login", %{"patrol_id" => ctx.patrol_id, "pin" => pin})

      assert %{
               "token" => token,
               "patrol" => %{"name" => "Tučňáci"},
               "config" => %{"positive_count" => 3, "negative_count" => 3}
             } = json_response(conn, 200)

      assert is_binary(token)
    end

    test "špatný PIN vrátí 401", ctx do
      conn =
        post(ctx.conn, "/api/feedback/login", %{"patrol_id" => ctx.patrol_id, "pin" => "000000"})

      assert %{"error" => "invalid_patrol_pin"} = json_response(conn, 401)
    end

    test "vypnutá zpětná vazba vrátí 403", ctx do
      {:ok, _} = Races.update_race(ctx.race_id, ctx.organizer_id, %{"feedback_enabled" => false})
      pin = reload(ctx.patrol_id)["feedback_pin"]

      conn =
        post(ctx.conn, "/api/feedback/login", %{"patrol_id" => ctx.patrol_id, "pin" => pin})

      assert %{"error" => "feedback_disabled"} = json_response(conn, 403)
    end
  end

  describe "plug AuthenticatePatrolFeedback" do
    test "bez tokenu vrátí 401", ctx do
      assert json_response(get(ctx.conn, "/api/feedback/me"), 401)
    end

    test "station token na feedback endpointu neprojde", ctx do
      station_id = hd(elem(Races.list_stations(ctx.race_id, ctx.organizer_id), 1))["id"]

      conn = ctx.conn |> as_station(station_id) |> get("/api/feedback/me")
      assert json_response(conn, 401)
    end

    test "po resetu PINu hlídky starý token neprojde", ctx do
      conn_with_token = as_patrol(ctx.conn, ctx.patrol_id)
      {:ok, _} = Races.reset_patrol_feedback_pin(ctx.patrol_id, ctx.organizer_id)

      assert json_response(get(conn_with_token, "/api/feedback/me"), 401)
    end
  end

  describe "GET /api/feedback/me" do
    test "vrátí hlídku, konfiguraci a stav okna", ctx do
      conn = ctx.conn |> as_patrol(ctx.patrol_id) |> get("/api/feedback/me")

      assert %{
               "patrol" => %{"name" => "Tučňáci"},
               "feedback" => nil,
               "window_open" => true
             } = json_response(conn, 200)
    end
  end

  describe "PUT /api/feedback/draft" do
    test "uloží obsah a vrátí záznam", ctx do
      conn =
        ctx.conn
        |> as_patrol(ctx.patrol_id)
        |> put("/api/feedback/draft", %{
          "positives" => ["šlo jim to"],
          "negatives" => [],
          "device_id" => @device_a
        })

      assert %{"feedback" => %{"positives" => ["šlo jim to"], "state" => "draft"}} =
               json_response(conn, 200)
    end

    test "druhé zařízení dostane 409 s časem zámku", ctx do
      authed = as_patrol(ctx.conn, ctx.patrol_id)

      put(authed, "/api/feedback/draft", %{
        "positives" => ["A"],
        "negatives" => [],
        "device_id" => @device_a
      })

      conn =
        put(as_patrol(build_conn(), ctx.patrol_id), "/api/feedback/draft", %{
          "positives" => ["B"],
          "negatives" => [],
          "device_id" => @device_b
        })

      assert %{"error" => "locked_by_other_device", "lock_at" => lock_at} = json_response(conn, 409)
      assert lock_at != nil
    end

    test "bez device_id vrátí 400", ctx do
      conn =
        ctx.conn
        |> as_patrol(ctx.patrol_id)
        |> put("/api/feedback/draft", %{"positives" => [], "negatives" => []})

      assert %{"error" => "missing_device"} = json_response(conn, 400)
    end

    test "po odeslání vrátí 423", ctx do
      authed = as_patrol(ctx.conn, ctx.patrol_id)

      put(authed, "/api/feedback/draft", %{
        "positives" => ["A"],
        "negatives" => [],
        "device_id" => @device_a
      })

      post(as_patrol(build_conn(), ctx.patrol_id), "/api/feedback/submit", %{
        "device_id" => @device_a
      })

      conn =
        put(as_patrol(build_conn(), ctx.patrol_id), "/api/feedback/draft", %{
          "positives" => ["pozdě"],
          "negatives" => [],
          "device_id" => @device_a
        })

      assert %{"error" => "feedback_submitted"} = json_response(conn, 423)
    end
  end

  describe "POST /api/feedback/takeover" do
    test "převezme zámek a druhé zařízení pak může psát", ctx do
      put(as_patrol(ctx.conn, ctx.patrol_id), "/api/feedback/draft", %{
        "positives" => ["A"],
        "negatives" => [],
        "device_id" => @device_a
      })

      conn =
        post(as_patrol(build_conn(), ctx.patrol_id), "/api/feedback/takeover", %{
          "device_id" => @device_b
        })

      assert json_response(conn, 200)

      conn =
        put(as_patrol(build_conn(), ctx.patrol_id), "/api/feedback/draft", %{
          "positives" => ["B"],
          "negatives" => [],
          "device_id" => @device_b
        })

      assert %{"feedback" => %{"positives" => ["B"]}} = json_response(conn, 200)
    end
  end

  describe "organizátorské endpointy" do
    setup ctx do
      put(as_patrol(ctx.conn, ctx.patrol_id), "/api/feedback/draft", %{
        "positives" => ["původní"],
        "negatives" => [],
        "device_id" => @device_a
      })

      post(as_patrol(build_conn(), ctx.patrol_id), "/api/feedback/submit", %{
        "device_id" => @device_a
      })

      {:ok, record} = Feedback.get_record(ctx.patrol_id)
      Map.put(ctx, :feedback_id, record["id"])
    end

    test "přehled vrací stav po hlídkách", ctx do
      conn =
        build_conn()
        |> as_organizer(ctx.organizer_id)
        |> get("/api/races/#{ctx.race_id}/feedback")

      assert %{"data" => [%{"state" => "submitted"}]} = json_response(conn, 200)
    end

    test "reopen vrátí záznam do editace", ctx do
      conn =
        build_conn()
        |> as_organizer(ctx.organizer_id)
        |> post("/api/patrol-feedback/#{ctx.feedback_id}/reopen", %{"reason" => "překlep"})

      assert %{"state" => "draft", "reopen_count" => 1} = json_response(conn, 200)
    end

    test "rozepsaný záznam odemknout nejde (409)", ctx do
      authed = as_organizer(build_conn(), ctx.organizer_id)
      post(authed, "/api/patrol-feedback/#{ctx.feedback_id}/reopen", %{"reason" => "první"})

      conn =
        build_conn()
        |> as_organizer(ctx.organizer_id)
        |> post("/api/patrol-feedback/#{ctx.feedback_id}/reopen", %{"reason" => "druhý"})

      assert %{"error" => "not_submitted"} = json_response(conn, 409)
    end

    test "člen s právem čtení reopen nesmí", ctx do
      reader = create_organizer()

      {:ok, _} =
        Races.upsert_race_member(ctx.race_id, ctx.organizer_id, %{
          "organizer_id" => reader,
          "role" => "read"
        })

      conn =
        build_conn()
        |> as_organizer(reader)
        |> post("/api/patrol-feedback/#{ctx.feedback_id}/reopen", %{"reason" => "cizí"})

      assert %{"error" => "forbidden"} = json_response(conn, 403)
    end

    test "admin nemá endpoint na přímou editaci obsahu", ctx do
      # Autenticita hodnocení: obsah smí měnit jen doprovod.
      conn =
        build_conn()
        |> as_organizer(ctx.organizer_id)
        |> put("/api/patrol-feedback/#{ctx.feedback_id}", %{"positives" => ["přepsáno"]})

      assert conn.status == 404

      # obsah zůstal nedotčený
      {:ok, record} = Feedback.get_record(ctx.patrol_id)
      assert record["positives"] == ["původní"]
    end
  end
end
