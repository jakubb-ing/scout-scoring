defmodule Api.ScoringCorrectionsDBTest do
  @moduledoc """
  Dodatečné opravy bodů. Test „v active neprojde" hlídá invariantu, na
  které stojí offline rozhodnutí R2 (last-write-wins bez verzování):
  opravy a běžící offline zápis se nesmí potkat.
  """
  use Api.DBCase, async: false

  @criteria [%{"name" => "Provedení", "max_points" => 10}]
  @scores [%{"criterion" => "Provedení", "points" => 7}]

  setup do
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
        %{"scores" => @scores},
        "station:#{station_id}"
      )

    %{
      race_id: race_id,
      organizer_id: organizer_id,
      station_id: station_id,
      patrol_id: patrol_id,
      actor: organizer_id
    }
  end

  defp close(ctx), do: {:ok, _} = Races.close_race(ctx.race_id, ctx.organizer_id)

  describe "guard na stav závodu" do
    test "v běžícím závodě oprava NEPROJDE", ctx do
      # Kdyby prošla, rozpadla by se invarianta offline R2.
      assert {:error, :race_not_closed} =
               Scoring.correct_entry(
                 ctx.race_id,
                 ctx.station_id,
                 ctx.patrol_id,
                 %{"scores" => [%{"criterion" => "Provedení", "points" => 10}]},
                 ctx.actor,
                 "pokus za běhu"
               )

      assert {:ok, entry} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)
      assert Scoring.total_points(entry) == 7
    end

    test "po uzavření projde a zapíše stopu", ctx do
      close(ctx)

      assert {:ok, entry} =
               Scoring.correct_entry(
                 ctx.race_id,
                 ctx.station_id,
                 ctx.patrol_id,
                 %{"scores" => [%{"criterion" => "Provedení", "points" => 10}]},
                 ctx.actor,
                 "rozhodčí nahlásil body telefonicky"
               )

      assert Scoring.total_points(entry) == 10
      assert entry["corrected_at"] != nil
      assert entry["corrected_by"] == ctx.actor
      assert entry["correction_reason"] == "rozhodčí nahlásil body telefonicky"
    end

    test "běžný station zápis po uzavření dál neprojde", ctx do
      close(ctx)

      assert {:error, :race_closed} =
               Scoring.upsert_entry(
                 ctx.race_id,
                 ctx.station_id,
                 ctx.patrol_id,
                 %{"scores" => @scores},
                 "station:#{ctx.station_id}"
               )
    end
  end

  describe "povinný důvod" do
    test "bez důvodu oprava neprojde a data se nezmění", ctx do
      close(ctx)

      for bad <- [nil, "", "ok"] do
        assert {:error, :reason_required} =
                 Scoring.correct_entry(
                   ctx.race_id,
                   ctx.station_id,
                   ctx.patrol_id,
                   %{"scores" => [%{"criterion" => "Provedení", "points" => 1}]},
                   ctx.actor,
                   bad
                 )
      end

      assert {:ok, entry} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)
      assert Scoring.total_points(entry) == 7
    end
  end

  describe "doplnění chybějícího hodnocení" do
    test "oprava umí založit zápis, který nikdy nevznikl", ctx do
      close(ctx)
      other_patrol = ctx.patrol_id

      # nová hlídka bez zápisu — použijeme druhé stanoviště
      {:ok, station2} =
        SurrealDB.one(
          "CREATE station SET race = $race, name = 'Druhé', position = 2, criteria = $criteria;",
          %{race: ctx.race_id, criteria: @criteria}
        )

      assert {:ok, entry} =
               Scoring.correct_entry(
                 ctx.race_id,
                 station2["id"],
                 other_patrol,
                 %{"scores" => [%{"criterion" => "Provedení", "points" => 5}]},
                 ctx.actor,
                 "chybějící zápis ze stanoviště"
               )

      assert Scoring.total_points(entry) == 5

      assert [log | _] = audit_entries(ctx.race_id, "score.correct")
      # před opravou žádný záznam nebyl — musí to jít odlišit od nuly
      assert log["payload"]["before_total"] == nil
    end
  end

  describe "audit log opravy" do
    test "zapíše se jako score.correct s původním i novým součtem", ctx do
      close(ctx)

      {:ok, _} =
        Scoring.correct_entry(
          ctx.race_id,
          ctx.station_id,
          ctx.patrol_id,
          %{"scores" => [%{"criterion" => "Provedení", "points" => 9}]},
          ctx.actor,
          "přepis z papíru"
        )

      assert [log | _] = audit_entries(ctx.race_id, "score.correct")
      assert log["payload"]["before_total"] == 7
      assert log["payload"]["after_total"] == 9
      assert log["payload"]["reason"] == "přepis z papíru"
      assert log["payload"]["race_state"] == "closed"
      assert log["actor"] == ctx.actor
    end

    test "oprava se v logu odliší od běžného zápisu", ctx do
      close(ctx)

      {:ok, _} =
        Scoring.correct_entry(
          ctx.race_id,
          ctx.station_id,
          ctx.patrol_id,
          %{"scores" => @scores},
          ctx.actor,
          "beze změny, jen potvrzení"
        )

      # původní zápis ze stanoviště je pořád vidět zvlášť
      assert audit_entries(ctx.race_id, "score.create") != []
      assert audit_entries(ctx.race_id, "score.correct") != []
    end
  end

  describe "smazání v rámci opravy" do
    test "smaže zápis a zaloguje původní obsah", ctx do
      close(ctx)
      {:ok, entry} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)

      assert :ok = Scoring.correct_delete(ctx.race_id, entry["id"], ctx.actor, "duplicitní zápis")
      assert {:error, :not_found} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)

      assert [log | _] = audit_entries(ctx.race_id, "score.correct_delete")
      assert log["payload"]["before_total"] == 7
      assert log["payload"]["reason"] == "duplicitní zápis"
    end

    test "v běžícím závodě mazání neprojde", ctx do
      {:ok, entry} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)

      assert {:error, :race_not_closed} =
               Scoring.correct_delete(ctx.race_id, entry["id"], ctx.actor, "pokus")

      assert {:ok, _} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)
    end

    test "bez důvodu mazání neprojde", ctx do
      close(ctx)
      {:ok, entry} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)

      assert {:error, :reason_required} =
               Scoring.correct_delete(ctx.race_id, entry["id"], ctx.actor, "")

      assert {:ok, _} = Scoring.get_entry(ctx.station_id, ctx.patrol_id)
    end
  end

  describe "veřejná výsledkovka" do
    test "nevydá důvod opravy ani jméno opravujícího", ctx do
      close(ctx)

      {:ok, _} =
        Scoring.correct_entry(
          ctx.race_id,
          ctx.station_id,
          ctx.patrol_id,
          %{"scores" => [%{"criterion" => "Provedení", "points" => 9}]},
          ctx.actor,
          "interní poznámka o konkrétním člověku"
        )

      assert {:ok, [entry]} = Scoring.list_for_race_public(ctx.race_id)

      # odznak „upraveno" potřebuje čas — ten zůstává
      assert entry["corrected_at"] != nil
      refute Map.has_key?(entry, "correction_reason")
      refute Map.has_key?(entry, "corrected_by")
      refute Map.has_key?(entry, "submitted_by")
    end

    test "organizátorský výpis důvod naopak obsahuje", ctx do
      close(ctx)

      {:ok, _} =
        Scoring.correct_entry(
          ctx.race_id,
          ctx.station_id,
          ctx.patrol_id,
          %{"scores" => [%{"criterion" => "Provedení", "points" => 9}]},
          ctx.actor,
          "interní poznámka"
        )

      assert {:ok, [entry]} = Scoring.list_for_race(ctx.race_id)
      assert entry["correction_reason"] == "interní poznámka"
    end
  end
end
