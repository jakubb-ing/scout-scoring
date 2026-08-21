defmodule Api.Auth.TokensTest do
  @moduledoc """
  Station a feedback tokeny. Klíčový je test, že si tyhle dvě domény
  nemůžou navzájem vyměnit token — sdílejí secret a liší se jen saltem.
  """
  use ExUnit.Case, async: true

  alias Api.Auth.{FeedbackToken, StationToken}

  @ttl 72 * 60 * 60

  describe "StationToken sign/verify" do
    test "roundtrip vrátí původní payload" do
      token = StationToken.sign("station:abc", "race:xyz", "nonce-1", @ttl)

      assert {:ok, %{station_id: "station:abc", race_id: "race:xyz", nonce: "nonce-1"}} =
               StationToken.verify(token, @ttl)
    end

    test "expirovaný token neprojde" do
      token = StationToken.sign("station:abc", "race:xyz", "nonce-1", @ttl)
      # max_age 0 => token vydaný teď je už po expiraci
      assert {:error, :expired} = StationToken.verify(token, -1)
    end

    test "poškozený token neprojde" do
      token = StationToken.sign("station:abc", "race:xyz", "nonce-1", @ttl)
      assert {:error, :invalid} = StationToken.verify(token <> "x", @ttl)
    end

    test "podvržený token bez platného podpisu neprojde" do
      assert {:error, _} = StationToken.verify("úplně-vymyšlený-token", @ttl)
    end
  end

  describe "FeedbackToken sign/verify" do
    test "roundtrip vrátí původní payload" do
      token = FeedbackToken.sign("patrol:abc", "race:xyz", "nonce-2", @ttl)

      assert {:ok, %{patrol_id: "patrol:abc", race_id: "race:xyz", nonce: "nonce-2"}} =
               FeedbackToken.verify(token, @ttl)
    end

    test "expirovaný token neprojde" do
      token = FeedbackToken.sign("patrol:abc", "race:xyz", "nonce-2", @ttl)
      assert {:error, :expired} = FeedbackToken.verify(token, -1)
    end
  end

  describe "oddělení domén (salt)" do
    test "station token neprojde jako feedback token" do
      station = StationToken.sign("station:abc", "race:xyz", "nonce", @ttl)
      assert {:error, _} = FeedbackToken.verify(station, @ttl)
    end

    test "feedback token neprojde jako station token" do
      feedback = FeedbackToken.sign("patrol:abc", "race:xyz", "nonce", @ttl)
      assert {:error, _} = StationToken.verify(feedback, @ttl)
    end
  end

  describe "generátory" do
    test "PIN je vždy 6 číslic včetně vedoucích nul" do
      for _ <- 1..500 do
        pin = StationToken.generate_pin()
        assert String.length(pin) == 6
        assert pin =~ ~r/^\d{6}$/
      end
    end

    test "veřejný kód neobsahuje znaky zaměnitelné při čtení nahlas" do
      # 0/O a 1/I/L se po telefonu pletou — proto nejsou v abecedě.
      for _ <- 1..200 do
        code = StationToken.generate_public_code()
        assert String.length(code) == 8
        assert code =~ ~r/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/
      end
    end

    test "veřejný kód umí i jinou délku" do
      assert String.length(StationToken.generate_public_code(12)) == 12
    end

    test "nonce se neopakuje" do
      nonces = for _ <- 1..200, do: StationToken.generate_nonce()
      assert length(Enum.uniq(nonces)) == 200
    end
  end
end
