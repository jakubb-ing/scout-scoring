defmodule Api.RacesPatrolAttrsTest do
  @moduledoc """
  Zámek polí hlídky ve stavu `ready`. Startovní číslo je vytištěné na
  kartách a kategorie určuje pořadí ve výsledcích — obojí se po vydání QR
  nesmí měnit.
  """
  use ExUnit.Case, async: true

  alias Api.Races

  @patrol %{
    "id" => "patrol:1",
    "start_number" => 7,
    "category" => "category:d",
    "name" => "Tučňáci",
    "members" => ["Jan"]
  }

  describe "draft — vše povoleno" do
    test "projde i změna startovního čísla a kategorie" do
      attrs = %{"name" => "Lišky", "start_number" => 99, "category" => "category:ch"}
      assert {:ok, ^attrs} = Races.restrict_patrol_attrs(%{"state" => "draft"}, @patrol, attrs)
    end
  end

  describe "ready — jen název a členové" do
    test "změna názvu projde" do
      attrs = %{"name" => "Lišky", "members" => ["Jan", "Eva"]}
      assert {:ok, result} = Races.restrict_patrol_attrs(%{"state" => "ready"}, @patrol, attrs)

      assert result["name"] == "Lišky"
      assert result["members"] == ["Jan", "Eva"]
    end

    test "nezaslané zamčené hodnoty se doplní z původního záznamu" do
      # do_update_patrol dělá plný SET — bez doplnění by se pole přepsala na nil.
      attrs = %{"name" => "Lišky"}
      assert {:ok, result} = Races.restrict_patrol_attrs(%{"state" => "ready"}, @patrol, attrs)

      assert result["start_number"] == 7
      assert result["category"] == "category:d"
    end

    test "změna startovního čísla je chyba, ne tiché ignorování" do
      attrs = %{"name" => "Lišky", "start_number" => 99}

      assert {:error, :field_locked} =
               Races.restrict_patrol_attrs(%{"state" => "ready"}, @patrol, attrs)
    end

    test "změna kategorie je chyba" do
      attrs = %{"name" => "Lišky", "category" => "category:ch"}

      assert {:error, :field_locked} =
               Races.restrict_patrol_attrs(%{"state" => "ready"}, @patrol, attrs)
    end

    test "poslání stejných hodnot zamčených polí projde" do
      # FE posílá celý formulář včetně read-only polí — to nesmí být chyba.
      attrs = %{"name" => "Lišky", "start_number" => 7, "category" => "category:d"}
      assert {:ok, _} = Races.restrict_patrol_attrs(%{"state" => "ready"}, @patrol, attrs)
    end
  end
end
