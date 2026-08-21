defmodule Api.FeedbackWindowTest do
  @moduledoc """
  Časové okno zpětné vazby. Chyba tady znamená buď zavřený formulář dřív,
  než doprovod dopíše, nebo naopak okno, které se nikdy nezavře.
  """
  use ExUnit.Case, async: true

  alias Api.Feedback

  defp patrol(state, closed_at \\ nil, enabled \\ true) do
    %{
      "feedback_enabled" => enabled,
      "race_state" => state,
      "race_closed_at" => closed_at
    }
  end

  defp iso(hours_ago) do
    DateTime.utc_now()
    |> DateTime.add(-hours_ago * 3600, :second)
    |> DateTime.to_iso8601()
  end

  describe "podle stavu závodu" do
    test "běžící závod je otevřený" do
      assert :ok = Feedback.ensure_feedback_open(patrol("active"), nil)
    end

    test "před spuštěním je zavřený s vlastní chybou" do
      assert {:error, :race_not_started} = Feedback.ensure_feedback_open(patrol("draft"), nil)
      assert {:error, :race_not_started} = Feedback.ensure_feedback_open(patrol("ready"), nil)
    end

    test "vypnutá zpětná vazba přebíjí i běžící závod" do
      assert {:error, :feedback_disabled} =
               Feedback.ensure_feedback_open(patrol("active", nil, false), nil)
    end
  end

  describe "okno po uzavření závodu" do
    test "hodinu po uzavření je ještě otevřeno" do
      assert :ok = Feedback.ensure_feedback_open(patrol("closed", iso(1)), nil)
    end

    test "11 hodin po uzavření je ještě otevřeno" do
      assert :ok = Feedback.ensure_feedback_open(patrol("closed", iso(11)), nil)
    end

    test "13 hodin po uzavření je zavřeno" do
      assert {:error, :feedback_window_closed} =
               Feedback.ensure_feedback_open(patrol("closed", iso(13)), nil)
    end

    test "uzavřený závod bez closed_at je zavřený" do
      assert {:error, :feedback_window_closed} =
               Feedback.ensure_feedback_open(patrol("closed", nil), nil)
    end
  end

  describe "reopen prodlužuje okno" do
    test "reopen po vypršení původního okna znovu otevře" do
      # Závod uzavřen před 20 h (okno dávno pryč), admin odemkl před hodinou.
      record = %{"reopened_at" => iso(1)}
      assert :ok = Feedback.ensure_feedback_open(patrol("closed", iso(20)), record)
    end

    test "13 hodin po reopenu je zase zavřeno" do
      record = %{"reopened_at" => iso(13)}

      assert {:error, :feedback_window_closed} =
               Feedback.ensure_feedback_open(patrol("closed", iso(20)), record)
    end

    test "starší reopen okno nezkracuje" do
      # Reopen před 20 h, ale závod se zavřel teprve před hodinou —
      # rozhoduje pozdější z obou časů.
      record = %{"reopened_at" => iso(20)}
      assert :ok = Feedback.ensure_feedback_open(patrol("closed", iso(1)), record)
    end

    test "záznam bez reopenu okno neovlivní" do
      record = %{"reopened_at" => nil}

      assert {:error, :feedback_window_closed} =
               Feedback.ensure_feedback_open(patrol("closed", iso(13)), record)
    end
  end

  describe "odolnost vůči tvaru dat" do
    test "nečitelné datum se bere jako chybějící, ne jako otevřené okno" do
      assert {:error, :feedback_window_closed} =
               Feedback.ensure_feedback_open(patrol("closed", "není datum"), nil)
    end

    test "DateTime struct funguje stejně jako ISO string" do
      closed = DateTime.add(DateTime.utc_now(), -3600, :second)
      assert :ok = Feedback.ensure_feedback_open(patrol("closed", closed), nil)
    end
  end
end
