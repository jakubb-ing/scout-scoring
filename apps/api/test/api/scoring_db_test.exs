defmodule Api.ScoringDBTest do
  @moduledoc """
  Jádro bodování: upsert zápisu, audit stopa a výpočet pořadí.
  Invariantou je jeden `score_entry` na dvojici (stanoviště, hlídka) —
  na ní stojí idempotence offline fronty.
  """
  use Api.DBCase, async: false

  @criteria [
    %{"name" => "Provedení", "max_points" => 10},
    %{"name" => "Rychlost", "max_points" => 5}
  ]

  setup do
    {race_id, organizer_id} = create_race()
    station_id = create_station(race_id, organizer_id, %{criteria: @criteria})
    category = create_category(race_id, organizer_id)

    {:ok, _} = Races.prepare_race(race_id, organizer_id)
    {:ok, _} = Races.activate_race(race_id, organizer_id)

    %{race_id: race_id, organizer_id: organizer_id, station_id: station_id, category: category}
  end

  defp add_patrol(ctx, start_number, name) do
    # hlídky se zakládají v draftu — vytvoříme je přímo, závod už běží
    {:ok, patrol} =
      SurrealDB.one(
        """
        CREATE patrol SET race = $race, category = $category,
          start_number = $start_number, name = $name, members = [];
        """,
        %{race: ctx.race_id, category: ctx.category, start_number: start_number, name: name}
      )

    patrol["id"]
  end

  defp score(ctx, patrol_id, points) do
    Scoring.upsert_entry(
      ctx.race_id,
      ctx.station_id,
      patrol_id,
      %{"scores" => [%{"criterion" => "Provedení", "points" => points}]},
      ctx.station_id
    )
  end

  describe "upsert_entry/5" do
    test "první zápis vytvoří záznam a zaloguje score.create", ctx do
      patrol = add_patrol(ctx, 1, "Tučňáci")

      assert {:ok, entry} = score(ctx, patrol, 8)
      assert entry["patrol"] == patrol
      assert entry["submitted_by"] == ctx.station_id

      assert [log | _] = audit_entries(ctx.race_id, "score.create")
      assert log["payload"]["after"] == [%{"criterion" => "Provedení", "points" => 8}]
    end

    test "opakovaný zápis přepíše a zaloguje score.update s původní hodnotou", ctx do
      patrol = add_patrol(ctx, 2, "Lišky")
      {:ok, _} = score(ctx, patrol, 3)
      {:ok, _} = score(ctx, patrol, 9)

      {:ok, entries} = Scoring.list_for_station(ctx.station_id)
      assert length(entries) == 1
      assert Scoring.total_points(hd(entries)) == 9

      assert [log | _] = audit_entries(ctx.race_id, "score.update")
      assert log["payload"]["before"] == [%{"criterion" => "Provedení", "points" => 3}]
    end

    test "hlídka z cizího závodu neprojde", ctx do
      {other_race, other_org} = create_race()
      foreign = create_patrol(other_race, other_org)

      assert {:error, :patrol_not_in_race} = score(ctx, foreign, 5)
    end

    test "stanoviště z cizího závodu neprojde", ctx do
      {other_race, other_org} = create_race()
      foreign_station = create_station(other_race, other_org)
      patrol = add_patrol(ctx, 3, "Sovy")

      assert {:error, :station_not_in_race} =
               Scoring.upsert_entry(
                 ctx.race_id,
                 foreign_station,
                 patrol,
                 %{"scores" => []},
                 "test"
               )
    end

    test "po uzavření závodu neprojde", ctx do
      patrol = add_patrol(ctx, 4, "Rysi")
      {:ok, _} = Races.close_race(ctx.race_id, ctx.organizer_id)

      assert {:error, :race_closed} = score(ctx, patrol, 5)
    end

    test "půlbody projdou", ctx do
      patrol = add_patrol(ctx, 5, "Vlci")
      assert {:ok, entry} = score(ctx, patrol, 7.5)
      assert Scoring.total_points(entry) == 7.5
    end
  end

  describe "leaderboard/1" do
    test "řadí sestupně podle bodů a počítá průchody", ctx do
      first = add_patrol(ctx, 10, "První")
      second = add_patrol(ctx, 11, "Druhá")

      {:ok, _} = score(ctx, first, 4)
      {:ok, _} = score(ctx, second, 9)

      assert {:ok, groups} = Scoring.leaderboard(ctx.race_id)
      rows = groups |> Enum.flat_map(& &1.rows)

      assert [%{name: "Druhá", total_points: 9, rank: 1}, %{name: "První", total_points: 4, rank: 2}] =
               Enum.map(rows, &Map.take(&1, [:name, :total_points, :rank]))

      assert Enum.all?(rows, &(&1.stations_done == 1))
    end

    test "shodné body sdílí pořadí a další nepřeskakuje", ctx do
      a = add_patrol(ctx, 20, "A")
      b = add_patrol(ctx, 21, "B")
      c = add_patrol(ctx, 22, "C")

      {:ok, _} = score(ctx, a, 5)
      {:ok, _} = score(ctx, b, 5)
      {:ok, _} = score(ctx, c, 1)

      assert {:ok, groups} = Scoring.leaderboard(ctx.race_id)

      ranks =
        groups
        |> Enum.flat_map(& &1.rows)
        |> Enum.map(&{&1.name, &1.rank})
        |> Enum.sort()

      # dense ranking: 1, 1, 2 — ne 1, 1, 3
      assert ranks == [{"A", 1}, {"B", 1}, {"C", 2}]
    end

    test "hlídka bez zápisu je v pořadí s nulou", ctx do
      add_patrol(ctx, 30, "Bez zápisu")

      assert {:ok, groups} = Scoring.leaderboard(ctx.race_id)
      rows = Enum.flat_map(groups, & &1.rows)

      assert [%{total_points: 0, stations_done: 0}] =
               Enum.map(rows, &Map.take(&1, [:total_points, :stations_done]))
    end
  end

  describe "delete_entry/3" do
    test "smaže zápis a zaloguje ho", ctx do
      patrol = add_patrol(ctx, 40, "Ke smazání")
      {:ok, entry} = score(ctx, patrol, 6)

      assert :ok = Scoring.delete_entry(ctx.race_id, entry["id"], ctx.organizer_id)
      assert {:error, :not_found} = Scoring.get_entry(ctx.station_id, patrol)
      assert audit_entries(ctx.race_id, "score.delete") != []
    end

    test "po uzavření závodu mazání neprojde", ctx do
      patrol = add_patrol(ctx, 41, "Zůstane")
      {:ok, entry} = score(ctx, patrol, 6)
      {:ok, _} = Races.close_race(ctx.race_id, ctx.organizer_id)

      assert {:error, :race_closed} =
               Scoring.delete_entry(ctx.race_id, entry["id"], ctx.organizer_id)

      assert {:ok, _} = Scoring.get_entry(ctx.station_id, patrol)
    end
  end
end
