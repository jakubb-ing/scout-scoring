defmodule Api.SurrealDBTest do
  use ExUnit.Case, async: true

  alias Api.SurrealDB

  describe "build_set/1" do
    test "poskládá klauzuli i vars" do
      assert {"name = $name, owner = $owner", %{name: "X", owner: "organizer:1"}} =
               SurrealDB.build_set(name: "X", owner: "organizer:1")
    end

    test "nil hodnoty vypadnou z klauzule i z vars" do
      # Na tomhle stojí částečný update — nezaslané pole se nesmí přepsat
      # na NONE jen proto, že v attrs chybí.
      {clause, vars} = SurrealDB.build_set(name: "X", held_on: nil, location: nil)

      assert clause == "name = $name"
      assert vars == %{name: "X"}
    end

    test "false a 0 jsou platné hodnoty, nevypadnou" do
      {clause, vars} = SurrealDB.build_set(feedback_enabled: false, feedback_positive_count: 0)

      assert clause == "feedback_enabled = $feedback_enabled, feedback_positive_count = $feedback_positive_count"
      assert vars == %{feedback_enabled: false, feedback_positive_count: 0}
    end

    test "prázdný vstup dá prázdnou klauzuli" do
      assert {"", %{}} = SurrealDB.build_set([])
    end
  end
end
