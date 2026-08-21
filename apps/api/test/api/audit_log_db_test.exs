defmodule Api.AuditLogDBTest do
  @moduledoc """
  Výpis audit logu. Stránkování a filtr existují kvůli exportu historie
  změn — s tvrdým LIMIT 200 by byl při námitce neúplný.
  """
  use Api.DBCase, async: false

  setup do
    {race_id, organizer_id} = create_race()
    %{race_id: race_id, organizer_id: organizer_id}
  end

  defp log_many(race_id, action, count) do
    for i <- 1..count do
      AuditLog.log(action, "organizer:test", race_id, "entity:#{i}", %{index: i})
      # SurrealDB řadí podle `at` — bez rozestupu by pořadí bylo nedefinované
      Process.sleep(2)
    end
  end

  test "vrací záznamy od nejnovějšího", ctx do
    log_many(ctx.race_id, "test.action", 3)

    # create_race sám loguje race.create — filtrujeme na vlastní akci
    assert {:ok, rows} = AuditLog.list_for_race(ctx.race_id, action: "test.action")
    assert length(rows) == 3
    assert hd(rows)["payload"]["index"] == 3
  end

  test "filtruje podle akce", ctx do
    log_many(ctx.race_id, "score.correct", 2)
    log_many(ctx.race_id, "score.create", 3)

    assert {:ok, rows} = AuditLog.list_for_race(ctx.race_id, action: "score.correct")
    assert length(rows) == 2
    assert Enum.all?(rows, &(&1["action"] == "score.correct"))
  end

  test "stránkuje přes limit a offset", ctx do
    log_many(ctx.race_id, "test.action", 5)

    assert {:ok, page1} = AuditLog.list_for_race(ctx.race_id, action: "test.action", limit: 2, offset: 0)
    assert {:ok, page2} = AuditLog.list_for_race(ctx.race_id, action: "test.action", limit: 2, offset: 2)

    assert length(page1) == 2
    assert length(page2) == 2
    # stránky se nepřekrývají
    assert MapSet.disjoint?(
             MapSet.new(page1, & &1["id"]),
             MapSet.new(page2, & &1["id"])
           )
  end

  test "offset za koncem vrátí prázdno", ctx do
    log_many(ctx.race_id, "test.action", 2)
    assert {:ok, []} = AuditLog.list_for_race(ctx.race_id, action: "test.action", limit: 10, offset: 50)
  end

  test "limit se ořízne do povoleného rozsahu", ctx do
    log_many(ctx.race_id, "test.action", 3)

    # nesmyslné hodnoty nesmí rozbít dotaz
    assert {:ok, rows} = AuditLog.list_for_race(ctx.race_id, action: "test.action", limit: 0)
    assert length(rows) == 1

    assert {:ok, _} = AuditLog.list_for_race(ctx.race_id, limit: 999_999)
    assert {:ok, _} = AuditLog.list_for_race(ctx.race_id, limit: -5, offset: -10)
  end

  test "zpětně kompatibilní volání s celým číslem funguje", ctx do
    log_many(ctx.race_id, "test.action", 3)
    assert {:ok, rows} = AuditLog.list_for_race(ctx.race_id, 2)
    assert length(rows) == 2
    assert Enum.all?(rows, &is_map/1)
  end

  test "log jiného závodu se nemíchá dovnitř", ctx do
    {other_race, _} = create_race()
    log_many(ctx.race_id, "test.action", 2)
    log_many(other_race, "test.action", 3)

    assert {:ok, rows} = AuditLog.list_for_race(ctx.race_id, action: "test.action")
    assert length(rows) == 2
  end
end
