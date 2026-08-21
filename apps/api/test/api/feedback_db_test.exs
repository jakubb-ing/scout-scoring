defmodule Api.FeedbackDBTest do
  @moduledoc """
  Zpětná vazba doprovodu: lock mezi zařízeními, odeslání, reopen adminem.
  Selhání locku znamená tiché přepsání textu, který někdo psal ručně.
  """
  use Api.DBCase, async: false

  @device_a "device-a"
  @device_b "device-b"

  setup do
    {race_id, organizer_id} = create_race()
    create_station(race_id, organizer_id)
    patrol_id = create_patrol(race_id, organizer_id, %{name: "Tučňáci"})

    {:ok, _} = Races.update_race(race_id, organizer_id, %{"feedback_enabled" => true})
    {:ok, _} = Races.prepare_race(race_id, organizer_id)
    {:ok, _} = Races.activate_race(race_id, organizer_id)

    %{race_id: race_id, organizer_id: organizer_id, patrol_id: patrol_id}
  end

  defp patrol_ctx(patrol_id) do
    {:ok, patrol} = Feedback.get_patrol_for_login(patrol_id)
    patrol
  end

  describe "autosave a lock" do
    test "první autosave založí záznam a zabere lock", ctx do
      patrol = patrol_ctx(ctx.patrol_id)

      assert {:ok, record} = Feedback.save_draft(patrol, ["šlo jim to"], [], @device_a)
      assert record["positives"] == ["šlo jim to"]
      assert record["lock_device"] == @device_a
      assert record["state"] == "draft"
    end

    test "opakovaný autosave stejného zařízení jen přepíše obsah", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["první"], [], @device_a)

      assert {:ok, record} = Feedback.save_draft(patrol, ["druhý"], ["zlepšit mapy"], @device_a)
      assert record["positives"] == ["druhý"]
      assert record["negatives"] == ["zlepšit mapy"]

      # pořád jeden záznam na hlídku
      {:ok, rows} =
        SurrealDB.all("SELECT id FROM patrol_feedback WHERE patrol = $p;", %{p: ctx.patrol_id})

      assert length(rows) == 1
    end

    test "druhé zařízení dostane konflikt místo přepsání", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["text A"], [], @device_a)

      assert {:error, {:locked_by_other_device, lock_at}} =
               Feedback.save_draft(patrol, ["text B"], [], @device_b)

      assert lock_at != nil
      # text prvního zařízení zůstal nedotčený
      assert reload_feedback(ctx.patrol_id)["positives"] == ["text A"]
    end

    test "autosave bez device_id neprojde", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      assert {:error, :missing_device} = Feedback.save_draft(patrol, [], [], nil)
      assert {:error, :missing_device} = Feedback.save_draft(patrol, [], [], "")
    end

    test "started se loguje jen jednou, autosave se neloguje", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["a"], [], @device_a)
      {:ok, _} = Feedback.save_draft(patrol, ["b"], [], @device_a)
      {:ok, _} = Feedback.save_draft(patrol, ["c"], [], @device_a)

      assert length(audit_entries(ctx.race_id, "feedback.started")) == 1
    end
  end

  describe "takeover" do
    test "převezme lock a původní zařízení pak dostane konflikt", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["text A"], [], @device_a)

      assert {:ok, record} = Feedback.takeover(patrol, @device_b)
      assert record["lock_device"] == @device_b

      assert {:ok, _} = Feedback.save_draft(patrol, ["text B"], [], @device_b)

      assert {:error, {:locked_by_other_device, _}} =
               Feedback.save_draft(patrol, ["text A2"], [], @device_a)
    end

    test "převzetí se loguje s oběma zařízeními", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["a"], [], @device_a)
      {:ok, _} = Feedback.takeover(patrol, @device_b)

      assert [entry | _] = audit_entries(ctx.race_id, "feedback.taken_over")
      assert entry["payload"]["from_device"] == @device_a
      assert entry["payload"]["to_device"] == @device_b
    end

    test "bez existujícího záznamu není co přebírat", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      assert {:error, :not_found} = Feedback.takeover(patrol, @device_b)
    end
  end

  describe "submit" do
    test "uzavře záznam, uvolní lock a zaloguje obsah", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["povedlo se"], ["zlepšit"], @device_a)

      assert {:ok, record} = Feedback.submit(patrol, @device_a)
      assert record["state"] == "submitted"
      assert record["submitted_at"] != nil
      assert record["lock_device"] in [nil, "NONE"]

      assert [entry | _] = audit_entries(ctx.race_id, "feedback.submitted")
      assert entry["payload"]["positives"] == ["povedlo se"]
    end

    test "po odeslání už autosave neprojde", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["a"], [], @device_a)
      {:ok, _} = Feedback.submit(patrol, @device_a)

      assert {:error, :feedback_submitted} =
               Feedback.save_draft(patrol, ["pozdní změna"], [], @device_a)
    end

    test "prázdná pole odeslání neblokují", ctx do
      # Validace prázdnoty je čistě FE upozornění.
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["", ""], ["", ""], @device_a)

      assert {:ok, record} = Feedback.submit(patrol, @device_a)
      assert record["state"] == "submitted"
    end

    test "bez rozepsaného záznamu není co odeslat", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      assert {:error, :not_found} = Feedback.submit(patrol, @device_a)
    end
  end

  describe "reopen adminem" do
    setup ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["původní text"], [], @device_a)
      {:ok, record} = Feedback.submit(patrol, @device_a)
      Map.put(ctx, :feedback_id, record["id"])
    end

    test "vrátí záznam do draftu a inkrementuje počítadlo", ctx do
      assert {:ok, record} = Feedback.reopen(ctx.feedback_id, ctx.organizer_id, "překlep ve jméně")
      assert record["state"] == "draft"
      assert record["reopen_count"] == 1
      assert record["reopened_at"] != nil
    end

    test "uloží snapshot obsahu před odemčením", ctx do
      {:ok, _} = Feedback.reopen(ctx.feedback_id, ctx.organizer_id, "důvod")

      assert [entry | _] = audit_entries(ctx.race_id, "feedback.reopened")
      assert entry["payload"]["positives"] == ["původní text"]
      assert entry["payload"]["reason"] == "důvod"
    end

    test "po odemčení jde zase editovat a znovu odeslat", ctx do
      {:ok, _} = Feedback.reopen(ctx.feedback_id, ctx.organizer_id, "důvod")
      patrol = patrol_ctx(ctx.patrol_id)

      assert {:ok, _} = Feedback.save_draft(patrol, ["opravený text"], [], @device_a)
      assert {:ok, record} = Feedback.submit(patrol, @device_a)
      assert record["state"] == "submitted"

      # druhé odeslání se loguje jako resubmit, ne jako první odevzdání
      assert audit_entries(ctx.race_id, "feedback.resubmitted") != []
    end

    test "opakovaný reopen je povolený a počítadlo roste", ctx do
      {:ok, _} = Feedback.reopen(ctx.feedback_id, ctx.organizer_id, "první")
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.submit(patrol, @device_a)

      assert {:ok, record} = Feedback.reopen(ctx.feedback_id, ctx.organizer_id, "druhý")
      assert record["reopen_count"] == 2
    end

    test "rozepsaný záznam odemykat nejde", ctx do
      {:ok, _} = Feedback.reopen(ctx.feedback_id, ctx.organizer_id, "první")
      assert {:error, :not_submitted} = Feedback.reopen(ctx.feedback_id, ctx.organizer_id, "znovu")
    end

    test "cizí organizátor odemknout nesmí", ctx do
      other = create_organizer()
      assert {:error, _} = Feedback.reopen(ctx.feedback_id, other, "cizí")
    end
  end

  describe "přehled pro organizátora" do
    test "vrací stav zpětné vazby po hlídkách", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["a"], [], @device_a)

      assert {:ok, [row]} = Feedback.list_for_race(ctx.race_id, ctx.organizer_id)
      assert row["patrol"] == ctx.patrol_id
      assert row["state"] == "draft"
    end

    test "veřejný výpis vydá jen odeslané záznamy", ctx do
      patrol = patrol_ctx(ctx.patrol_id)
      {:ok, _} = Feedback.save_draft(patrol, ["rozepsáno"], [], @device_a)

      assert {:ok, []} = Feedback.list_submitted_for_race(ctx.race_id)

      {:ok, _} = Feedback.submit(patrol, @device_a)
      assert {:ok, [row]} = Feedback.list_submitted_for_race(ctx.race_id)
      assert row["positives"] == ["rozepsáno"]
    end
  end

  describe "vypnutá zpětná vazba" do
    test "login neprojde, když je funkce vypnutá", ctx do
      {:ok, _} = Races.update_race(ctx.race_id, ctx.organizer_id, %{"feedback_enabled" => false})
      pin = reload(ctx.patrol_id)["feedback_pin"]

      assert {:error, :feedback_disabled} = Feedback.authenticate_patrol_pin(ctx.patrol_id, pin)
    end

    test "se správným PINem a zapnutou funkcí login projde", ctx do
      pin = reload(ctx.patrol_id)["feedback_pin"]

      assert {:ok, patrol} = Feedback.authenticate_patrol_pin(ctx.patrol_id, pin)
      assert patrol["id"] == ctx.patrol_id
    end

    test "špatný PIN neprojde", ctx do
      assert {:error, :invalid_pin} = Feedback.authenticate_patrol_pin(ctx.patrol_id, "000000")
    end
  end

  defp reload_feedback(patrol_id) do
    {:ok, record} = Api.Feedback.get_record(patrol_id)
    record
  end
end
