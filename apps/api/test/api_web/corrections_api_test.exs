defmodule ApiWeb.CorrectionsAPITest do
  @moduledoc """
  Opravy bodů a výsledkovky přes HTTP. Kromě status kódů se hlídá, co se
  dostane do veřejné odpovědi — důvod opravy a jméno opravujícího tam
  nepatří.
  """
  use Api.APICase, async: false

  @criteria [%{"name" => "Provedení", "max_points" => 10}]

  setup %{conn: conn} do
    {race_id, organizer_id} = create_race()
    station_id = create_station(race_id, organizer_id, %{criteria: @criteria})
    patrol_id = create_patrol(race_id, organizer_id, %{name: "Tučňáci"})

    {:ok, _} = Races.prepare_race(race_id, organizer_id)
    {:ok, _} = Races.activate_race(race_id, organizer_id)

    {:ok, _} =
      Scoring.upsert_entry(
        race_id,
        station_id,
        patrol_id,
        %{"scores" => [%{"criterion" => "Provedení", "points" => 7}]},
        station_id
      )

    %{
      conn: as_organizer(conn, organizer_id),
      race_id: race_id,
      organizer_id: organizer_id,
      station_id: station_id,
      patrol_id: patrol_id
    }
  end

  defp close(ctx), do: {:ok, _} = Races.close_race(ctx.race_id, ctx.organizer_id)

  defp correction_body(ctx, points, reason) do
    %{
      "station_id" => ctx.station_id,
      "patrol_id" => ctx.patrol_id,
      "scores" => [%{"criterion" => "Provedení", "points" => points}],
      "reason" => reason
    }
  end

  describe "POST /races/:id/scores/correct" do
    test "v běžícím závodě vrátí 409", ctx do
      conn =
        post(ctx.conn, "/api/races/#{ctx.race_id}/scores/correct", correction_body(ctx, 10, "pokus"))

      assert %{"error" => "race_not_closed"} = json_response(conn, 409)
    end

    test "po uzavření projde a vrátí opravený zápis", ctx do
      close(ctx)

      conn =
        post(
          ctx.conn,
          "/api/races/#{ctx.race_id}/scores/correct",
          correction_body(ctx, 10, "rozhodčí nahlásil telefonicky")
        )

      assert %{"scores" => [%{"points" => 10}], "corrected_at" => corrected_at} =
               json_response(conn, 200)

      assert corrected_at != nil
    end

    test "bez důvodu vrátí 422", ctx do
      close(ctx)

      conn =
        post(ctx.conn, "/api/races/#{ctx.race_id}/scores/correct", correction_body(ctx, 10, ""))

      assert %{"error" => "reason_required"} = json_response(conn, 422)
    end

    test "chybějící pole vrátí 400", ctx do
      close(ctx)
      conn = post(ctx.conn, "/api/races/#{ctx.race_id}/scores/correct", %{"reason" => "x"})
      assert %{"error" => "missing_fields"} = json_response(conn, 400)
    end

    test "člen s právem čtení opravovat nesmí", ctx do
      close(ctx)
      reader = create_organizer()

      {:ok, _} =
        Races.upsert_race_member(ctx.race_id, ctx.organizer_id, %{
          "organizer_id" => reader,
          "role" => "read"
        })

      conn =
        build_conn()
        |> as_organizer(reader)
        |> post("/api/races/#{ctx.race_id}/scores/correct", correction_body(ctx, 1, "cizí zásah"))

      assert %{"error" => "forbidden"} = json_response(conn, 403)
    end

    test "bez přihlášení vrátí 401", ctx do
      close(ctx)

      conn =
        post(build_conn(), "/api/races/#{ctx.race_id}/scores/correct", correction_body(ctx, 1, "x"))

      assert json_response(conn, 401)
    end
  end

  describe "DELETE /races/:id/scores/:entry_id" do
    test "smaže zápis a vrátí 204", ctx do
      close(ctx)
      {:ok, entry} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)

      conn =
        delete(ctx.conn, "/api/races/#{ctx.race_id}/scores/#{entry["id"]}", %{
          "reason" => "duplicitní zápis"
        })

      assert response(conn, 204)
      assert {:error, :not_found} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)
    end

    test "bez důvodu vrátí 422 a zápis nechá být", ctx do
      close(ctx)
      {:ok, entry} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)

      conn = delete(ctx.conn, "/api/races/#{ctx.race_id}/scores/#{entry["id"]}", %{"reason" => ""})

      assert %{"error" => "reason_required"} = json_response(conn, 422)
      assert {:ok, _} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)
    end
  end

  describe "GET /races/:id/audit" do
    test "vrací historii a umí filtrovat podle akce", ctx do
      close(ctx)

      post(
        ctx.conn,
        "/api/races/#{ctx.race_id}/scores/correct",
        correction_body(ctx, 9, "přepis z papíru")
      )

      conn = get(ctx.conn, "/api/races/#{ctx.race_id}/audit?action=score.correct")

      assert %{"data" => [entry]} = json_response(conn, 200)
      assert entry["action"] == "score.correct"
      assert entry["payload"]["before_total"] == 7
      assert entry["payload"]["after_total"] == 9
    end

    test "respektuje limit a offset", ctx do
      conn = get(ctx.conn, "/api/races/#{ctx.race_id}/audit?limit=1&offset=0")
      assert %{"data" => data} = json_response(conn, 200)
      assert length(data) <= 1
    end

    test "cizí organizátor historii nevidí", ctx do
      outsider = create_organizer()

      conn =
        build_conn()
        |> as_organizer(outsider)
        |> get("/api/races/#{ctx.race_id}/audit")

      assert json_response(conn, 404)
    end
  end

  describe "GET /races/:id/results" do
    test "organizátor vidí i důvod opravy", ctx do
      close(ctx)

      post(
        ctx.conn,
        "/api/races/#{ctx.race_id}/scores/correct",
        correction_body(ctx, 9, "interní poznámka")
      )

      conn = get(ctx.conn, "/api/races/#{ctx.race_id}/results")

      assert %{"score_entries" => [entry]} = json_response(conn, 200)
      assert entry["correction_reason"] == "interní poznámka"
    end
  end

  describe "GET /public/races/:id/results" do
    test "bez kódu vrátí 401", ctx do
      conn = get(build_conn(), "/api/public/races/#{ctx.race_id}/results?code=spatny")
      assert %{"error" => "invalid_code"} = json_response(conn, 401)
    end

    test "se správným kódem nevydá důvod opravy ani jméno", ctx do
      close(ctx)

      post(
        ctx.conn,
        "/api/races/#{ctx.race_id}/scores/correct",
        correction_body(ctx, 9, "interní poznámka o člověku")
      )

      code = reload(ctx.race_id)["public_code"]
      conn = get(build_conn(), "/api/public/races/#{ctx.race_id}/results?code=#{code}")

      assert %{"score_entries" => [entry]} = json_response(conn, 200)
      assert entry["corrected_at"] != nil
      refute Map.has_key?(entry, "correction_reason")
      refute Map.has_key?(entry, "corrected_by")
      refute Map.has_key?(entry, "submitted_by")
    end

    test "zpětná vazba se veřejně nezobrazí, dokud ji organizátor nezveřejní", ctx do
      {:ok, _} = Races.update_race(ctx.race_id, ctx.organizer_id, %{"feedback_enabled" => true})
      code = reload(ctx.race_id)["public_code"]

      conn = get(build_conn(), "/api/public/races/#{ctx.race_id}/results?code=#{code}")
      assert %{"patrol_feedback" => nil} = json_response(conn, 200)

      {:ok, _} = Races.update_race(ctx.race_id, ctx.organizer_id, %{"feedback_public" => true})
      conn = get(build_conn(), "/api/public/races/#{ctx.race_id}/results?code=#{code}")
      assert %{"patrol_feedback" => []} = json_response(conn, 200)
    end
  end
end
