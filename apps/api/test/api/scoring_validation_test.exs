defmodule Api.ScoringValidationTest do
  use ExUnit.Case, async: true

  alias Api.Scoring

  describe "validate_reason/1" do
    test "smysluplný důvod projde" do
      assert :ok = Scoring.validate_reason("rozhodčí nahlásil body telefonicky")
    end

    test "přesně tři znaky projdou" do
      assert :ok = Scoring.validate_reason("abc")
    end

    test "prázdný, nil a příliš krátký důvod neprojdou" do
      assert {:error, :reason_required} = Scoring.validate_reason("")
      assert {:error, :reason_required} = Scoring.validate_reason(nil)
      assert {:error, :reason_required} = Scoring.validate_reason("ok")
    end

    test "samé mezery neprojdou" do
      assert {:error, :reason_required} = Scoring.validate_reason("      ")
    end

    test "nestringová hodnota neprojde" do
      assert {:error, :reason_required} = Scoring.validate_reason(%{})
      assert {:error, :reason_required} = Scoring.validate_reason(123)
    end
  end

  describe "total_points/1" do
    test "sečte body napříč kritérii" do
      entry = %{"scores" => [%{"points" => 3}, %{"points" => 4.5}, %{"points" => 0}]}
      assert Scoring.total_points(entry) == 7.5
    end

    test "chybějící body počítá jako nulu" do
      entry = %{"scores" => [%{"criterion" => "A"}, %{"points" => 2}]}
      assert Scoring.total_points(entry) == 2
    end

    test "zápis bez kritérií je nula" do
      assert Scoring.total_points(%{"scores" => []}) == 0
      assert Scoring.total_points(%{}) == 0
    end

    test "chybějící záznam je nil, ne nula" do
      # V audit logu se musí dát odlišit „opraveno z 0" od „záznam nebyl".
      assert Scoring.total_points(nil) == nil
    end
  end
end
