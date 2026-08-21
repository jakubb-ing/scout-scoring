defmodule Api.RacesReadyStateDBTest do
  @moduledoc """
  Průchod stavy závodu draft → ready → active → closed.

  Nejdůležitější je idempotence vydávání PINů: opakovaný průchod
  `ready → draft → ready` nesmí zneplatnit už vytištěné QR kódy.
  """
  use Api.DBCase, async: false

  describe "prepare_race/2" do
    test "vydá PINy stanovištím a hlídkám a přepne stav" do
      {race_id, organizer_id} = create_race()
      station_id = create_station(race_id, organizer_id)
      patrol_id = create_patrol(race_id, organizer_id)

      assert {:ok, payload} = Races.prepare_race(race_id, organizer_id)
      assert payload.race["state"] == "ready"
      assert payload.race["prepared_at"] != nil

      station = reload(station_id)
      assert is_binary(station["pin"])
      assert String.length(station["pin"]) == 6
      assert station["is_active"] == true

      patrol = reload(patrol_id)
      assert is_binary(patrol["feedback_pin"])
      assert is_binary(patrol["feedback_nonce"])
    end

    test "z jiného stavu než draft neprojde" do
      {race_id, organizer_id} = create_race()
      create_station(race_id, organizer_id)
      {:ok, _} = Races.prepare_race(race_id, organizer_id)

      assert {:error, :race_not_draft} = Races.prepare_race(race_id, organizer_id)
    end

    test "opakovaný průchod ready → draft → ready PINy NEZMĚNÍ" do
      # Kdyby se PINy přegenerovaly, všechny vytištěné QR kódy by tiše
      # přestaly platit a poznalo by se to až v terénu.
      {race_id, organizer_id} = create_race()
      station_id = create_station(race_id, organizer_id)
      patrol_id = create_patrol(race_id, organizer_id)

      {:ok, _} = Races.prepare_race(race_id, organizer_id)
      station_pin = reload(station_id)["pin"]
      station_nonce = reload(station_id)["access_token_hash"]
      patrol_pin = reload(patrol_id)["feedback_pin"]

      {:ok, _} = Races.unprepare_race(race_id, organizer_id)
      {:ok, _} = Races.prepare_race(race_id, organizer_id)

      assert reload(station_id)["pin"] == station_pin
      assert reload(station_id)["access_token_hash"] == station_nonce
      assert reload(patrol_id)["feedback_pin"] == patrol_pin
    end

    test "hlídka přidaná po návratu do draftu dostane PIN při dalším prepare" do
      {race_id, organizer_id} = create_race()
      create_station(race_id, organizer_id)
      first_patrol = create_patrol(race_id, organizer_id)

      {:ok, _} = Races.prepare_race(race_id, organizer_id)
      first_pin = reload(first_patrol)["feedback_pin"]

      {:ok, _} = Races.unprepare_race(race_id, organizer_id)
      late_patrol = create_patrol(race_id, organizer_id, %{start_number: 999})
      assert reload(late_patrol)["feedback_pin"] == nil

      {:ok, _} = Races.prepare_race(race_id, organizer_id)

      assert is_binary(reload(late_patrol)["feedback_pin"])
      # a stávající hlídce se PIN nezměnil
      assert reload(first_patrol)["feedback_pin"] == first_pin
    end
  end

  describe "reissue_station_tokens/2" do
    test "PINy naopak přegeneruje — invalidace je záměr" do
      {race_id, organizer_id} = create_race()
      station_id = create_station(race_id, organizer_id)
      {:ok, _} = Races.prepare_race(race_id, organizer_id)

      original = reload(station_id)["pin"]
      assert {:ok, _} = Races.reissue_station_tokens(race_id, organizer_id)

      assert reload(station_id)["pin"] != original
    end
  end

  describe "unprepare_race/2" do
    test "vrátí stav a shodí is_active, PINy nechá být" do
      {race_id, organizer_id} = create_race()
      station_id = create_station(race_id, organizer_id)
      {:ok, _} = Races.prepare_race(race_id, organizer_id)
      pin = reload(station_id)["pin"]

      assert {:ok, race} = Races.unprepare_race(race_id, organizer_id)
      assert race["state"] == "draft"
      assert reload(station_id)["is_active"] == false
      assert reload(station_id)["pin"] == pin
    end

    test "z draftu neprojde" do
      {race_id, organizer_id} = create_race()
      assert {:error, :race_not_ready} = Races.unprepare_race(race_id, organizer_id)
    end
  end

  describe "activate_race/2" do
    test "draft → active napřímo neprojde" do
      {race_id, organizer_id} = create_race()
      create_station(race_id, organizer_id)

      assert {:error, :race_not_ready} = Races.activate_race(race_id, organizer_id)
    end

    test "z ready projde a nemění PINy" do
      {race_id, organizer_id} = create_race()
      station_id = create_station(race_id, organizer_id)
      {:ok, _} = Races.prepare_race(race_id, organizer_id)
      pin = reload(station_id)["pin"]

      assert {:ok, %{race: race}} = Races.activate_race(race_id, organizer_id)
      assert race["state"] == "active"
      assert reload(station_id)["pin"] == pin
    end
  end

  describe "editace ve stavu ready" do
    setup do
      {race_id, organizer_id} = create_race()
      station_id = create_station(race_id, organizer_id)
      patrol_id = create_patrol(race_id, organizer_id, %{start_number: 5, name: "Tučňáci"})
      {:ok, _} = Races.prepare_race(race_id, organizer_id)

      %{race_id: race_id, organizer_id: organizer_id, station_id: station_id, patrol_id: patrol_id}
    end

    test "přidání hlídky neprojde", ctx do
      assert {:error, :race_not_draft} =
               Races.create_patrol(ctx.race_id, ctx.organizer_id, %{
                 "name" => "Nová",
                 "start_number" => 42
               })
    end

    test "mazání hlídky neprojde", ctx do
      assert {:error, :race_not_draft} = Races.delete_patrol(ctx.patrol_id, ctx.organizer_id)
    end

    test "změna názvu hlídky projde", ctx do
      assert {:ok, patrol} =
               Races.update_patrol(ctx.patrol_id, ctx.organizer_id, %{
                 "name" => "Lišky",
                 "members" => ["Jan"]
               })

      assert patrol["name"] == "Lišky"
      assert patrol["start_number"] == 5
    end

    test "změna startovního čísla je field_locked", ctx do
      assert {:error, :field_locked} =
               Races.update_patrol(ctx.patrol_id, ctx.organizer_id, %{
                 "name" => "Tučňáci",
                 "start_number" => 99
               })

      assert reload(ctx.patrol_id)["start_number"] == 5
    end

    test "úprava kritérií stanoviště projde", ctx do
      assert {:ok, station} =
               Races.update_station(ctx.station_id, ctx.organizer_id, %{
                 "name" => "Uzly a vazby",
                 "criteria" => [%{"name" => "Rychlost", "max_points" => 5}]
               })

      assert station["name"] == "Uzly a vazby"
      assert [%{"name" => "Rychlost"}] = station["criteria"]
    end
  end

  describe "stažení hlídky" do
    setup do
      {race_id, organizer_id} = create_race()
      station_id = create_station(race_id, organizer_id)
      category = create_category(race_id, organizer_id)
      keep = create_patrol(race_id, organizer_id, %{start_number: 1, category: category})
      drop = create_patrol(race_id, organizer_id, %{start_number: 2, category: category})
      {:ok, _} = Races.prepare_race(race_id, organizer_id)
      {:ok, _} = Races.activate_race(race_id, organizer_id)

      %{
        race_id: race_id,
        organizer_id: organizer_id,
        station_id: station_id,
        keep: keep,
        drop: drop
      }
    end

    test "stažená hlídka zmizí z leaderboardu, ale zápisy zůstanou", ctx do
      {:ok, _} =
        Scoring.upsert_entry(
          ctx.race_id,
          ctx.station_id,
          ctx.drop,
          %{"scores" => [%{"criterion" => "Provedení", "points" => 8}]},
          "station:#{ctx.station_id}"
        )

      assert {:ok, _} = Races.withdraw_patrol(ctx.drop, ctx.organizer_id, "nedostavila se")

      {:ok, groups} = Scoring.leaderboard(ctx.race_id)
      patrol_ids = groups |> Enum.flat_map(& &1.rows) |> Enum.map(& &1.patrol_id)

      assert ctx.keep in patrol_ids
      refute ctx.drop in patrol_ids

      # záznam se nemaže — musí zůstat dohledatelný
      assert {:ok, entry} = Scoring.get_entry(ctx.station_id, ctx.drop)
      assert entry["patrol"] == ctx.drop
    end

    test "stažená hlídka se nenabízí rozhodčím na stanovišti", ctx do
      {:ok, _} = Races.withdraw_patrol(ctx.drop, ctx.organizer_id, nil)

      {:ok, patrols} = Races.list_patrols_public(ctx.race_id)
      ids = Enum.map(patrols, & &1["id"])

      assert ctx.keep in ids
      refute ctx.drop in ids
    end

    test "vrácení hlídky ji zase zařadí", ctx do
      {:ok, _} = Races.withdraw_patrol(ctx.drop, ctx.organizer_id, "omyl")
      assert {:ok, restored} = Races.restore_patrol(ctx.drop, ctx.organizer_id)
      assert restored["withdrawn"] == false

      {:ok, patrols} = Races.list_patrols_public(ctx.race_id)
      assert ctx.drop in Enum.map(patrols, & &1["id"])
    end

    test "stažení se loguje i s důvodem", ctx do
      {:ok, _} = Races.withdraw_patrol(ctx.drop, ctx.organizer_id, "nepřijela")

      entries = audit_entries(ctx.race_id, "patrol.withdraw")
      assert [entry | _] = entries
      assert entry["payload"]["reason"] == "nepřijela"
    end
  end

  describe "veřejný seznam závodů" do
    test "závod v ready se nezobrazuje" do
      {race_id, organizer_id} = create_race()
      create_station(race_id, organizer_id)
      {:ok, _} = Races.prepare_race(race_id, organizer_id)

      {:ok, races} = Races.list_active_races_public()
      refute race_id in Enum.map(races, & &1["id"])

      {:ok, _} = Races.activate_race(race_id, organizer_id)
      {:ok, races} = Races.list_active_races_public()
      assert race_id in Enum.map(races, & &1["id"])
    end
  end
end
