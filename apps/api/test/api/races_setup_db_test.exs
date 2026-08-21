defmodule Api.RacesSetupDBTest do
  @moduledoc """
  Příprava závodu: kategorie, hlídky, stanoviště, sdílení a veřejný kód.
  Doplňuje `races_ready_state_db_test.exs`, který řeší přechody stavů.
  """
  use Api.DBCase, async: false

  setup do
    {race_id, organizer_id} = create_race(%{name: "Okresní kolo"})
    %{race_id: race_id, organizer_id: organizer_id}
  end

  describe "kategorie" do
    test "založení a výpis", ctx do
      # Závod se zakládá s výchozími kategoriemi — ověřujeme přírůstek.
      {:ok, before} = Races.list_categories(ctx.race_id, ctx.organizer_id)
      id = create_category(ctx.race_id, ctx.organizer_id, "Dívčí")

      assert {:ok, categories} = Races.list_categories(ctx.race_id, ctx.organizer_id)
      assert length(categories) == length(before) + 1
      assert %{"name" => "Dívčí", "scored" => true} = Enum.find(categories, &(&1["id"] == id))
    end

    test "kategorii s hlídkou smazat nejde", ctx do
      category = create_category(ctx.race_id, ctx.organizer_id)
      create_patrol(ctx.race_id, ctx.organizer_id, %{category: category})

      assert {:error, :category_has_patrols} = Races.delete_category(category, ctx.organizer_id)

      {:ok, categories} = Races.list_categories(ctx.race_id, ctx.organizer_id)
      assert Enum.any?(categories, &(&1["id"] == category))
    end

    test "prázdnou kategorii smazat jde a zaloguje se", ctx do
      category = create_category(ctx.race_id, ctx.organizer_id)

      assert {:ok, :deleted} = Races.delete_category(category, ctx.organizer_id)
      assert audit_entries(ctx.race_id, "category.delete") != []
    end
  end

  describe "hromadné zakládání" do
    test "bulk_create_patrols založí všechny", ctx do
      category = create_category(ctx.race_id, ctx.organizer_id)

      patrols =
        for i <- 1..5 do
          %{"name" => "Hlídka #{i}", "start_number" => i, "category" => category}
        end

      assert {:ok, created} = Races.bulk_create_patrols(ctx.race_id, ctx.organizer_id, patrols)
      assert length(created) == 5

      assert {:ok, listed} = Races.list_patrols(ctx.race_id, ctx.organizer_id)
      assert length(listed) == 5
      # výpis je seřazený podle startovního čísla
      assert Enum.map(listed, & &1["start_number"]) == [1, 2, 3, 4, 5]
    end

    test "částečné selhání se ohlásí jako :partial", ctx do
      category = create_category(ctx.race_id, ctx.organizer_id)

      patrols = [
        %{"name" => "OK", "start_number" => 1, "category" => category},
        # startovní číslo musí být > 0 (ASSERT ve schématu)
        %{"name" => "Špatná", "start_number" => 0, "category" => category}
      ]

      assert {:partial, report} = Races.bulk_create_patrols(ctx.race_id, ctx.organizer_id, patrols)
      assert report.created == 1
      assert length(report.failed) == 1
    end

    test "bulk_create_stations založí všechna", ctx do
      stations = [
        %{"name" => "Uzly", "position" => 1, "criteria" => []},
        %{"name" => "Mapa", "position" => 2, "criteria" => []}
      ]

      assert {:ok, created} = Races.bulk_create_stations(ctx.race_id, ctx.organizer_id, stations)
      assert length(created) == 2
    end
  end

  describe "stanoviště" do
    test "deaktivace smaže přístupové údaje a znovuaktivace je vydá", ctx do
      station_id = create_station(ctx.race_id, ctx.organizer_id)
      {:ok, _} = Races.prepare_race(ctx.race_id, ctx.organizer_id)
      {:ok, _} = Races.activate_race(ctx.race_id, ctx.organizer_id)

      assert {:ok, _} = Races.deactivate_station(station_id, ctx.organizer_id)
      deactivated = reload(station_id)
      assert deactivated["is_active"] == false
      assert deactivated["pin"] in [nil, ""]

      assert {:ok, _} = Races.deactivate_station(station_id, ctx.organizer_id)
      reactivated = reload(station_id)
      assert reactivated["is_active"] == true
      assert is_binary(reactivated["pin"])
    end

    test "výpis pro veřejnost vrací jen aktivní stanoviště běžícího závodu", ctx do
      station_id = create_station(ctx.race_id, ctx.organizer_id)

      assert {:ok, []} = Races.list_active_stations_public(ctx.race_id)

      {:ok, _} = Races.prepare_race(ctx.race_id, ctx.organizer_id)
      {:ok, _} = Races.activate_race(ctx.race_id, ctx.organizer_id)

      assert {:ok, [%{"id" => ^station_id}]} = Races.list_active_stations_public(ctx.race_id)
    end
  end

  describe "sdílení závodu" do
    test "role read vidí, ale needituje", ctx do
      reader = create_organizer()

      {:ok, _} =
        Races.upsert_race_member(ctx.race_id, ctx.organizer_id, %{
          "organizer_id" => reader,
          "role" => "read"
        })

      assert {:ok, race} = Races.get_race(ctx.race_id, reader)
      assert race["access_role"] == "read"

      assert {:error, :forbidden} =
               Races.update_race(ctx.race_id, reader, %{"name" => "Přejmenováno"})
    end

    test "role edit editovat smí", ctx do
      editor = create_organizer()

      {:ok, _} =
        Races.upsert_race_member(ctx.race_id, ctx.organizer_id, %{
          "organizer_id" => editor,
          "role" => "edit"
        })

      assert {:ok, race} = Races.update_race(ctx.race_id, editor, %{"name" => "Přejmenováno"})
      assert race["name"] == "Přejmenováno"
    end

    test "vlastníka nelze přidat jako člena", ctx do
      assert {:error, :invalid_member} =
               Races.upsert_race_member(ctx.race_id, ctx.organizer_id, %{
                 "organizer_id" => ctx.organizer_id,
                 "role" => "edit"
               })
    end

    test "neznámá role neprojde", ctx do
      other = create_organizer()

      assert {:error, :invalid_role} =
               Races.upsert_race_member(ctx.race_id, ctx.organizer_id, %{
                 "organizer_id" => other,
                 "role" => "superadmin"
               })
    end

    test "opakované sdílení roli přepíše, nezaloží druhé členství", ctx do
      member = create_organizer()

      attrs = fn role -> %{"organizer_id" => member, "role" => role} end
      {:ok, _} = Races.upsert_race_member(ctx.race_id, ctx.organizer_id, attrs.("read"))
      {:ok, _} = Races.upsert_race_member(ctx.race_id, ctx.organizer_id, attrs.("edit"))

      assert {:ok, members} = Races.list_race_members(ctx.race_id, ctx.organizer_id)
      assert [%{"role" => "edit"}] = members
    end

    test "cizí organizátor závod nevidí", ctx do
      outsider = create_organizer()
      assert {:error, :not_found} = Races.get_race(ctx.race_id, outsider)
    end
  end

  describe "veřejný kód výsledků" do
    test "závod dostane kód při založení a ověření funguje", ctx do
      code = reload(ctx.race_id)["public_code"]
      assert is_binary(code)

      assert {:ok, race} = Races.verify_public_results_code(ctx.race_id, code)
      assert race["name"] == "Okresní kolo"
    end

    test "špatný ani prázdný kód neprojde", ctx do
      assert {:error, :invalid_code} = Races.verify_public_results_code(ctx.race_id, "SPATNY")
      assert {:error, :invalid_code} = Races.verify_public_results_code(ctx.race_id, "")
      assert {:error, :invalid_code} = Races.verify_public_results_code(ctx.race_id, nil)
    end

    test "regenerace starý kód zneplatní", ctx do
      old_code = reload(ctx.race_id)["public_code"]

      assert {:ok, _} = Races.regenerate_public_code(ctx.race_id, ctx.organizer_id)

      assert {:error, :invalid_code} = Races.verify_public_results_code(ctx.race_id, old_code)
      new_code = reload(ctx.race_id)["public_code"]
      assert {:ok, _} = Races.verify_public_results_code(ctx.race_id, new_code)
    end
  end
end
