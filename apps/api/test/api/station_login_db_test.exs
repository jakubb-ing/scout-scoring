defmodule Api.StationLoginDBTest do
  @moduledoc """
  Login stanoviště musí odlišit „závod ještě neběží" od „špatný PIN".
  Dokud to neuměl, rozhodčí se správným PINem v `ready` honil neexistující
  chybu.
  """
  use Api.DBCase, async: false

  setup do
    {race_id, organizer_id} = create_race(%{name: "Okresní kolo"})
    station_id = create_station(race_id, organizer_id, %{name: "Uzly"})

    %{race_id: race_id, organizer_id: organizer_id, station_id: station_id}
  end

  test "v draftu se přihlásit nejde", ctx do
    # PINy ještě nejsou vydané, ale i tak se nesmí tvrdit „špatný PIN".
    assert {:error, {:race_not_started, patrol}} =
             Races.authenticate_station_pin(ctx.station_id, "000000")

    assert patrol["race_state"] == "draft"
  end

  test "v ready vrátí race_not_started i se správným PINem", ctx do
    {:ok, _} = Races.prepare_race(ctx.race_id, ctx.organizer_id)
    pin = reload(ctx.station_id)["pin"]

    assert {:error, {:race_not_started, station}} =
             Races.authenticate_station_pin(ctx.station_id, pin)

    assert station["race_state"] == "ready"
    assert station["race_name"] == "Okresní kolo"
    assert station["name"] == "Uzly"
  end

  test "v active se správným PINem projde", ctx do
    {:ok, _} = Races.prepare_race(ctx.race_id, ctx.organizer_id)
    {:ok, _} = Races.activate_race(ctx.race_id, ctx.organizer_id)
    pin = reload(ctx.station_id)["pin"]

    assert {:ok, station} = Races.authenticate_station_pin(ctx.station_id, pin)
    assert station["id"] == ctx.station_id
    assert is_binary(station["access_token_hash"])
  end

  test "v active se špatným PINem vrátí invalid_pin", ctx do
    {:ok, _} = Races.prepare_race(ctx.race_id, ctx.organizer_id)
    {:ok, _} = Races.activate_race(ctx.race_id, ctx.organizer_id)

    assert {:error, :invalid_pin} = Races.authenticate_station_pin(ctx.station_id, "000000")
  end

  test "po uzavření závodu vrátí race_closed", ctx do
    {:ok, _} = Races.prepare_race(ctx.race_id, ctx.organizer_id)
    {:ok, _} = Races.activate_race(ctx.race_id, ctx.organizer_id)
    pin = reload(ctx.station_id)["pin"]
    {:ok, _} = Races.close_race(ctx.race_id, ctx.organizer_id)

    assert {:error, :race_closed} = Races.authenticate_station_pin(ctx.station_id, pin)
  end

  test "neexistující stanoviště nevyzradí, že neexistuje", ctx do
    _ = ctx
    assert {:error, :invalid_pin} = Races.authenticate_station_pin("station:neexistuje", "123456")
  end

  test "get_active_station pustí jen běžící závod", ctx do
    {:ok, _} = Races.prepare_race(ctx.race_id, ctx.organizer_id)
    assert {:error, :not_found} = Races.get_active_station(ctx.station_id)

    {:ok, _} = Races.activate_race(ctx.race_id, ctx.organizer_id)
    assert {:ok, _} = Races.get_active_station(ctx.station_id)
  end

  test "reset PINu funguje v ready i v active a mění nonce", ctx do
    {:ok, _} = Races.prepare_race(ctx.race_id, ctx.organizer_id)
    before = reload(ctx.station_id)

    assert {:ok, _} = Races.reset_station_pin(ctx.station_id, ctx.organizer_id)
    after_reset = reload(ctx.station_id)

    assert after_reset["pin"] != before["pin"]
    # rotace nonce zneplatní dřív vydané tokeny
    assert after_reset["access_token_hash"] != before["access_token_hash"]
  end
end
