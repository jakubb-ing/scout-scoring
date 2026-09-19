defmodule ApiWeb.StatsAPITest do
  @moduledoc """
  HTTP testy pro endpoint statistik GET /api/races/:race_id/stats.
  """
  use Api.APICase, async: false

  alias Api.{Races, Scoring}

  @criteria [
    %{"name" => "Rychlost", "max_points" => 10},
    %{"name" => "Přesnost", "max_points" => 15}
  ]

  setup %{conn: conn} do
    {race_id, organizer_id} = create_race(%{time_tracking: "per_station"})
    station_id = create_station(race_id, organizer_id, %{name: "Lanovka", criteria: @criteria})
    patrol_id = create_patrol(race_id, organizer_id, %{name: "Kamzíci", start_number: 1})

    {:ok, _} = Races.prepare_race(race_id, organizer_id)
    {:ok, _} = Races.activate_race(race_id, organizer_id)

    {:ok, _} =
      Scoring.upsert_entry(
        race_id,
        station_id,
        patrol_id,
        %{
          "scores" => [
            %{"criterion" => "Rychlost", "points" => 8},
            %{"criterion" => "Přesnost", "points" => 12}
          ],
          "arrived_at" => "2026-06-14T10:00:00Z",
          "departed_at" => "2026-06-14T10:15:00Z"
        },
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

  describe "GET /api/races/:race_id/stats" do
    test "bez tokenu vrátí 401", ctx do
      conn = get(build_conn(), "/api/races/#{ctx.race_id}/stats")
      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end

    test "cizí organizátor vrátí 404", ctx do
      {_other_race, other_org} = create_race()
      other_conn = as_organizer(build_conn(), other_org)

      conn = get(other_conn, "/api/races/#{ctx.race_id}/stats")
      assert %{"error" => "not_found"} = json_response(conn, 404)
    end

    test "vrátí kompletní data pro statistiku včetně provozních metrik", ctx do
      conn = get(ctx.conn, "/api/races/#{ctx.race_id}/stats")
      assert %{
        "race" => race,
        "stations" => stations,
        "patrols" => patrols,
        "categories" => categories,
        "entries" => entries
      } = json_response(conn, 200)

      assert race["id"] == ctx.race_id
      assert race["time_tracking"] == "per_station"

      assert length(stations) == 1
      [station] = stations
      assert station["id"] == ctx.station_id
      assert station["name"] == "Lanovka"
      assert station["max_points"] == 25
      assert station["ops"]["corrections_count"] == 0
      assert station["ops"]["avg_duration_minutes"] == 15.0
      assert station["ops"]["queue_max_minutes"] == 0.0

      assert length(patrols) == 1
      [patrol] = patrols
      assert patrol["id"] == ctx.patrol_id
      assert patrol["name"] == "Kamzíci"
      assert patrol["start_number"] == 1
      assert patrol["withdrawn"] == false

      assert length(categories) > 0

      assert length(entries) == 1
      [entry] = entries
      assert entry["station_id"] == ctx.station_id
      assert entry["patrol_id"] == ctx.patrol_id
      assert entry["total_points"] == 20
      assert entry["criteria"]["Rychlost"] == 8
      assert entry["criteria"]["Přesnost"] == 12
    end

    test "zápis nese časy pro časovou osu", ctx do
      conn = get(ctx.conn, "/api/races/#{ctx.race_id}/stats")
      assert %{"entries" => [entry]} = json_response(conn, 200)

      assert entry["arrived_at"] =~ "10:00"
      assert entry["departed_at"] =~ "10:15"
      # created_at je vždy, i když rozhodčí časy nevyplní.
      assert is_binary(entry["created_at"])
      assert entry["corrected_at"] in [nil, false]
    end

    test "bez ručních časů zůstane jen created_at", %{conn: _} do
      # Vlastní závod, ať se nemíchá se zápisem z setupu, který časy má.
      {race_id, organizer_id} = create_race()
      station_id = create_station(race_id, organizer_id, %{name: "Šifra", criteria: @criteria})
      patrol_id = create_patrol(race_id, organizer_id, %{name: "Rysi", start_number: 1})

      {:ok, _} = Races.prepare_race(race_id, organizer_id)
      {:ok, _} = Races.activate_race(race_id, organizer_id)

      {:ok, _} =
        Scoring.upsert_entry(
          race_id,
          station_id,
          patrol_id,
          %{"scores" => [%{"criterion" => "Rychlost", "points" => 5}]},
          station_id
        )

      conn = get(as_organizer(build_conn(), organizer_id), "/api/races/#{race_id}/stats")
      assert %{"entries" => [entry]} = json_response(conn, 200)

      assert entry["arrived_at"] == nil
      assert entry["departed_at"] == nil
      assert is_binary(entry["created_at"])
    end
  end
end
