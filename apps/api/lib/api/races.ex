defmodule Api.Races do
  @moduledoc "Race / Category / Patrol / Station context."

  alias Api.{SurrealDB, Auth.StationToken, AuditLog, Accounts}
  require Logger

  # ---------- Race ----------

  def list_races(organizer_id) do
    if admin?(organizer_id) do
      list_all_races_for_admin(organizer_id)
    else
      list_accessible_races(organizer_id)
    end
  end

  defp list_all_races_for_admin(organizer_id) do
    with {:ok, races} <- SurrealDB.all("SELECT * FROM race ORDER BY created_at DESC;", %{}) do
      {:ok, Enum.map(races, &put_access(&1, access_role(&1, organizer_id)))}
    end
  end

  defp list_accessible_races(organizer_id) do
    with {:ok, owned} <-
           SurrealDB.all(
             "SELECT * FROM race WHERE owner = $organizer ORDER BY created_at DESC;",
             %{organizer: organizer_id}
           ),
         {:ok, shared} <- list_shared_races(organizer_id) do
      races =
        (Enum.map(owned, &put_access(&1, "owner")) ++
           Enum.flat_map(shared, fn %{"race" => race_id, "role" => role} ->
             case SurrealDB.one("SELECT * FROM $id LIMIT 1;", %{id: race_id}) do
               {:ok, race} when is_map(race) -> [put_access(race, role)]
               _ -> []
             end
           end))
        |> Enum.uniq_by(& &1["id"])
        |> Enum.sort_by(&to_string(&1["created_at"]), :desc)

      {:ok, races}
    end
  end

  defp list_shared_races(organizer_id) do
    case SurrealDB.all(
           """
           SELECT race, role
           FROM race_member
           WHERE organizer = $organizer;
           """,
           %{organizer: organizer_id}
         ) do
      {:ok, shared} -> {:ok, shared}
      {:error, {:surreal, "The table 'race_member' does not exist"}} -> {:ok, []}
      err -> err
    end
  end

  def get_race(id, organizer_id) do
    case race_access(id, organizer_id) do
      {:ok, race, role} -> {:ok, put_access(race, role)}
      _ -> {:error, :not_found}
    end
  end

  def create_race(organizer_id, attrs) do
    {set, vars} =
      SurrealDB.build_set(
        name: attrs["name"],
        held_on: attrs["held_on"],
        location: attrs["location"],
        owner: organizer_id,
        scoring_model: attrs["scoring_model"] || "sum_points",
        time_tracking: attrs["time_tracking"] || "none"
      )

    with {:ok, race} <- SurrealDB.one("CREATE race SET #{set};", vars) do
      AuditLog.log("race.create", organizer_id, race["id"], race["id"], %{name: race["name"]})
      {:ok, put_access(race, "owner")}
    end
  end

  def update_race(id, organizer_id, attrs) do
    with {:ok, _race} <- ensure_race_edit(id, organizer_id) do
      do_update_race(id, organizer_id, attrs)
    end
  end

  defp do_update_race(id, organizer_id, attrs) do
    {set, vars} =
      SurrealDB.build_set(
        name: attrs["name"],
        held_on: attrs["held_on"],
        location: attrs["location"],
        scoring_model: attrs["scoring_model"],
        time_tracking: attrs["time_tracking"]
      )

    vars = Map.merge(vars, %{id: id})

    case SurrealDB.one("UPDATE $id SET #{set};", vars) do
      {:ok, race} when is_map(race) ->
        AuditLog.log("race.update", organizer_id, id, id, attrs)
        get_race(race["id"], organizer_id)

      _ ->
        {:error, :not_found}
    end
  end

  def activate_race(id, organizer_id) do
    with {:ok, race} <- ensure_race_edit(id, organizer_id),
         {:ok, stations} <- list_stations(id, organizer_id),
         {:ok, issued} <- issue_tokens_for(race, stations),
         {:ok, activated_race} <-
           SurrealDB.one(
             "UPDATE $id SET state = 'active', activated_at = time::now();",
             %{id: id}
           ) do
      AuditLog.log("race.activate", organizer_id, id, id, %{})
      {:ok, Map.put(issued, :race, put_access(activated_race, race["access_role"]))}
    end
  end

  @doc """
  Re-issues fresh station tokens and PINs for every station on an
  already-active race. Rotating invalidates any previously-printed QR
  codes — that's the feature, not a bug. QR URLs are built client-side
  from the frontend's own origin.
  """
  def reissue_station_tokens(race_id, organizer_id) do
    with {:ok, race} <- ensure_race_edit(race_id, organizer_id),
         {:ok, stations} <- list_stations(race_id, organizer_id),
         {:ok, issued} <- issue_tokens_for(race, stations) do
      AuditLog.log("race.reissue_tokens", organizer_id, race_id, race_id, %{})
      {:ok, issued}
    end
  end

  defp issue_tokens_for(%{"id" => race_id}, stations) do
    updated =
      Enum.map(stations, fn %{"id" => sid} = station ->
        pin = StationToken.generate_pin()
        nonce = StationToken.generate_nonce()

        SurrealDB.query(
          "UPDATE $id SET access_token_hash = $nonce, pin = $pin, is_active = true;",
          %{id: sid, pin: pin, nonce: nonce}
        )

        Map.merge(station, %{
          "pin" => pin,
          "access_token_hash" => nonce
        })
      end)

    {:ok, %{race_id: race_id, stations: updated}}
  end

  def close_race(id, organizer_id) do
    sql = "UPDATE $id SET state = 'closed', closed_at = time::now();"

    with {:ok, existing} <- ensure_race_edit(id, organizer_id),
         {:ok, race} when is_map(race) <- SurrealDB.one(sql, %{id: id}) do
      SurrealDB.query(
        "UPDATE station SET is_active = false WHERE race = $race;",
        %{race: id}
      )

      AuditLog.log("race.close", organizer_id, id, id, %{})
      {:ok, put_access(race, existing["access_role"])}
    else
      _ -> {:error, :not_found}
    end
  end

  def list_race_members(race_id, organizer_id) do
    with {:ok, race} <- ensure_race_edit(race_id, organizer_id),
         {:ok, members} <-
           SurrealDB.all(
             """
             SELECT id, role, organizer
             FROM race_member
             WHERE race = $race;
             """,
             %{race: race_id}
           ) do
      members =
        members
        |> Enum.reject(&(&1["organizer"] == race["owner"]))
        |> Enum.map(&with_member_organizer/1)
        |> Enum.sort_by(&String.downcase(&1["email"] || ""))

      {:ok, members}
    end
  end

  def upsert_race_member(race_id, organizer_id, attrs) do
    member_organizer = attrs["organizer_id"] || attrs["organizer"]
    role = attrs["role"]

    with true <- role in ["read", "edit"],
         {:ok, race} <- ensure_race_edit(race_id, organizer_id),
         false <- race["owner"] == member_organizer do
      case SurrealDB.one(
             "SELECT id FROM race_member WHERE race = $race AND organizer = $organizer LIMIT 1;",
             %{race: race_id, organizer: member_organizer}
           ) do
        {:ok, %{"id" => membership_id}} ->
          update_race_member(membership_id, organizer_id, %{"role" => role})

        {:ok, nil} ->
          SurrealDB.one(
            """
            CREATE race_member SET
              race = $race,
              organizer = $organizer,
              role = $role;
            """,
            %{race: race_id, organizer: member_organizer, role: role}
          )

        err ->
          err
      end
    else
      false -> {:error, :invalid_member}
      _ -> {:error, :not_found}
    end
  end

  def update_race_member(membership_id, organizer_id, %{"role" => role})
      when role in ["read", "edit"] do
    with {:ok, member} when is_map(member) <-
           SurrealDB.one("SELECT * FROM $id;", %{id: membership_id}),
         {:ok, _race} <- ensure_race_edit(member["race"], organizer_id) do
      SurrealDB.one(
        "UPDATE $id SET role = $role, updated_at = time::now();",
        %{id: membership_id, role: role}
      )
    else
      _ -> {:error, :not_found}
    end
  end

  def update_race_member(_, _, _), do: {:error, :invalid_role}

  def delete_race_member(membership_id, organizer_id) do
    with {:ok, member} when is_map(member) <-
           SurrealDB.one("SELECT * FROM $id;", %{id: membership_id}),
         {:ok, _race} <- ensure_race_edit(member["race"], organizer_id),
         {:ok, _} <- SurrealDB.query("DELETE $id;", %{id: membership_id}) do
      {:ok, :deleted}
    else
      _ -> {:error, :not_found}
    end
  end

  # ---------- Category ----------

  def list_categories(race_id, organizer_id) do
    with {:ok, _} <- get_race(race_id, organizer_id) do
      SurrealDB.all(
        "SELECT * FROM category WHERE race = $race ORDER BY name;",
        %{race: race_id}
      )
    end
  end

  def create_category(race_id, organizer_id, attrs) do
    with {:ok, _} <- ensure_race_edit(race_id, organizer_id) do
      SurrealDB.one(
        "CREATE category SET race = $race, name = $name, scored = $scored;",
        %{race: race_id, name: attrs["name"], scored: attrs["scored"] != false}
      )
    end
  end

  def delete_category(id, organizer_id) do
    with {:ok, category} when is_map(category) <-
           SurrealDB.one("SELECT * FROM $id LIMIT 1;", %{id: id}),
         {:ok, _race} <- ensure_race_edit(category["race"], organizer_id),
         {:ok, nil} <-
           SurrealDB.one(
             "SELECT id FROM patrol WHERE category = $category LIMIT 1;",
             %{category: id}
           ),
         {:ok, _} <- SurrealDB.query("DELETE $id;", %{id: id}) do
      AuditLog.log("category.delete", organizer_id, category["race"], id, %{
        name: category["name"]
      })

      {:ok, :deleted}
    else
      {:ok, nil} -> {:error, :not_found}
      {:error, _} = err -> err
      _ -> {:error, :category_has_patrols}
    end
  end

  # ---------- Patrol ----------

  def list_patrols(race_id, organizer_id) do
    with {:ok, _} <- get_race(race_id, organizer_id) do
      SurrealDB.all(
        "SELECT * FROM patrol WHERE race = $race ORDER BY start_number;",
        %{race: race_id}
      )
    end
  end

  def list_patrols_public(race_id) do
    # Used by station clients: only minimal fields, no organizer auth needed.
    SurrealDB.all(
      "SELECT id, start_number, name, category FROM patrol WHERE race = $race ORDER BY start_number;",
      %{race: race_id}
    )
  end

  def list_active_races_public do
    SurrealDB.all(
      """
      SELECT id, name, held_on, location, created_at
      FROM race
      WHERE state = 'active'
      ORDER BY held_on DESC, created_at DESC;
      """,
      %{}
    )
  end

  def list_active_stations_public(race_id) do
    SurrealDB.all(
      """
      SELECT id, name, position
      FROM station
      WHERE race = $race AND race.state = 'active' AND is_active = true
      ORDER BY position, name;
      """,
      %{race: race_id}
    )
  end

  def create_patrol(race_id, organizer_id, attrs) do
    with {:ok, _} <- ensure_race_draft_edit(race_id, organizer_id) do
      sql = """
      CREATE patrol SET
        race = $race,
        category = $category,
        start_number = $start_number,
        name = $name,
        members = $members;
      """

      SurrealDB.one(sql, %{
        race: race_id,
        category: attrs["category"],
        start_number: attrs["start_number"],
        name: attrs["name"],
        members: attrs["members"] || []
      })
    end
  end

  def bulk_create_patrols(race_id, organizer_id, patrols) when is_list(patrols) do
    with {:ok, _} <- ensure_race_draft_edit(race_id, organizer_id) do
      results =
        Enum.map(patrols, fn attrs ->
          case create_patrol(race_id, organizer_id, attrs) do
            {:ok, p} -> {:ok, p}
            err -> {:error, %{attrs: attrs, error: inspect(err)}}
          end
        end)

      failures = Enum.filter(results, &match?({:error, _}, &1))

      if failures == [] do
        {:ok, Enum.map(results, fn {:ok, p} -> p end)}
      else
        {:partial,
         %{
           created: Enum.count(results, &match?({:ok, _}, &1)),
           failed: Enum.map(failures, fn {:error, e} -> e end)
         }}
      end
    end
  end

  def update_patrol(id, organizer_id, attrs) do
    with {:ok, patrol} when is_map(patrol) <-
           SurrealDB.one("SELECT * FROM $id LIMIT 1;", %{id: id}),
         {:ok, _race} <- ensure_race_draft_edit(patrol["race"], organizer_id) do
      do_update_patrol(id, attrs)
    else
      {:ok, nil} -> {:error, :not_found}
      {:error, :race_not_draft} = err -> err
      {:error, :forbidden} = err -> err
      {:error, {:surreal, _}} = err -> err
      _ -> {:error, :not_found}
    end
  end

  defp do_update_patrol(id, attrs) do
    sql = """
    UPDATE $id SET
      category = $category,
      start_number = $start_number,
      name = $name,
      members = $members
    """

    SurrealDB.one(sql, %{
      id: id,
      category: attrs["category"],
      start_number: attrs["start_number"],
      name: attrs["name"],
      members: attrs["members"] || []
    })
  end

  def delete_patrol(id, organizer_id) do
    with {:ok, patrol} when is_map(patrol) <-
           SurrealDB.one("SELECT id, race FROM $id LIMIT 1;", %{id: id}),
         {:ok, _race} <- ensure_race_draft_edit(patrol["race"], organizer_id),
         {:ok, _} <- SurrealDB.query("DELETE $id;", %{id: patrol["id"]}) do
      {:ok, :deleted}
    else
      {:ok, nil} -> {:error, :not_found}
      err -> err
    end
  end

  # ---------- Station ----------

  def list_stations(race_id, organizer_id) do
    with {:ok, _} <- get_race(race_id, organizer_id) do
      SurrealDB.all(
        "SELECT * FROM station WHERE race = $race ORDER BY position, name;",
        %{race: race_id}
      )
    end
  end

  def create_station(race_id, organizer_id, attrs) do
    with {:ok, _} <- ensure_race_draft_edit(race_id, organizer_id) do
      sql = """
      CREATE station SET
        race = $race,
        name = $name,
        position = $position,
        allow_half_points = $allow_half_points,
        criteria = $criteria;
      """

      SurrealDB.one(sql, %{
        race: race_id,
        name: attrs["name"],
        position: attrs["position"] || 0,
        allow_half_points: attrs["allow_half_points"] == true,
        criteria: attrs["criteria"] || []
      })
    end
  end

  def bulk_create_stations(race_id, organizer_id, stations) when is_list(stations) do
    with {:ok, _} <- ensure_race_draft_edit(race_id, organizer_id) do
      results =
        Enum.map(stations, fn attrs ->
          case create_station(race_id, organizer_id, attrs) do
            {:ok, s} -> {:ok, s}
            err -> {:error, %{attrs: attrs, error: inspect(err)}}
          end
        end)

      failures = Enum.filter(results, &match?({:error, _}, &1))

      if failures == [] do
        {:ok, Enum.map(results, fn {:ok, s} -> s end)}
      else
        {:partial,
         %{
           created: Enum.count(results, &match?({:ok, _}, &1)),
           failed: Enum.map(failures, fn {:error, e} -> e end)
         }}
      end
    end
  end

  def update_station(id, organizer_id, attrs) do
    case SurrealDB.one("SELECT * FROM $id LIMIT 1;", %{id: id}) do
      {:ok, station} when is_map(station) ->
        with {:ok, _race} <- ensure_race_draft_edit(station["race"], organizer_id) do
          do_update_station(id, attrs)
        end

      {:ok, nil} ->
        {:error, :not_found}

      {:error, _} = err ->
        err
    end
  end

  defp do_update_station(id, attrs) do
    sql = """
    UPDATE $id SET
      name = $name,
      position = $position,
      allow_half_points = $allow_half_points,
      criteria = $criteria
    """

    SurrealDB.one(sql, %{
      id: id,
      name: attrs["name"],
      position: attrs["position"] || 0,
      allow_half_points: attrs["allow_half_points"] == true,
      criteria: attrs["criteria"] || []
    })
  end

  def deactivate_station(id, organizer_id) do
    with {:ok, station} when is_map(station) <-
           SurrealDB.one("SELECT * FROM $id LIMIT 1;", %{id: id}),
         {:ok, _race} <- ensure_race_edit(station["race"], organizer_id) do
      case station["is_active"] do
        true ->
          case deactivate_station_record(id, station["allow_half_points"] == true) do
            {:ok, station} when is_map(station) ->
              {:ok, clear_station_access_fields(station)}

            {:ok, nil} ->
              {:error, :not_found}

            err ->
              err
          end

        _ ->
          activate_station_record(id, station)
      end
    else
      {:ok, nil} -> {:error, :not_found}
      {:error, :forbidden} = err -> err
      {:error, {:surreal, _}} = err -> err
      _ -> {:error, :not_found}
    end
  end

  defp activate_station_record(id, station) do
    allow_half_points = station["allow_half_points"] == true
    pin = station["pin"] || StationToken.generate_pin()
    nonce = station["access_token_hash"] || StationToken.generate_nonce()

    sql = """
    UPDATE ONLY type::record($table, $record_id) SET
      is_active = true,
      allow_half_points = $allow_half_points,
      pin = $pin,
      access_token_hash = $nonce;
    """

    typed_update =
      with {:ok, vars} <- station_record_vars(id) do
        SurrealDB.one(
          sql,
          vars
          |> Map.put(:allow_half_points, allow_half_points)
          |> Map.put(:pin, pin)
          |> Map.put(:nonce, nonce)
        )
      end

    case typed_update do
      {:ok, station} when is_map(station) ->
        {:ok, station}

      {:ok, nil} ->
        fallback_activate_station_record(id, allow_half_points, pin, nonce)

      {:error, reason} ->
        Logger.warning("Station #{id} typed activate failed: #{inspect(reason)}")
        fallback_activate_station_record(id, allow_half_points, pin, nonce)

      _ ->
        fallback_activate_station_record(id, allow_half_points, pin, nonce)
    end
  end

  defp fallback_activate_station_record(id, allow_half_points, pin, nonce) do
    sql = """
    UPDATE $id SET
      is_active = true,
      allow_half_points = $allow_half_points,
      pin = $pin,
      access_token_hash = $nonce;
    """

    case SurrealDB.one(sql, %{
           id: id,
           allow_half_points: allow_half_points,
           pin: pin,
           nonce: nonce
         }) do
      {:ok, station} when is_map(station) ->
        {:ok, station}

      err ->
        err
    end
  end

  defp deactivate_station_record(id, allow_half_points) do
    typed_update =
      with {:ok, vars} <- station_record_vars(id) do
        SurrealDB.one(
          """
          UPDATE ONLY type::record($table, $record_id) SET
            is_active = false,
            allow_half_points = $allow_half_points;
          """,
          Map.put(vars, :allow_half_points, allow_half_points)
        )
      end

    case typed_update do
      {:ok, station} when is_map(station) ->
        {:ok, station}

      {:ok, nil} ->
        fallback_deactivate_station_record(id, allow_half_points)

      {:error, reason} ->
        Logger.warning("Station #{id} typed deactivate failed: #{inspect(reason)}")
        fallback_deactivate_station_record(id, allow_half_points)

      _ ->
        fallback_deactivate_station_record(id, allow_half_points)
    end
  end

  defp fallback_deactivate_station_record(id, allow_half_points) do
    SurrealDB.one(
      "UPDATE $id SET is_active = false, allow_half_points = $allow_half_points;",
      %{id: id, allow_half_points: allow_half_points}
    )
  end

  defp station_record_vars("station:" <> record_id) when byte_size(record_id) > 0 do
    {:ok, %{table: "station", record_id: record_id}}
  end

  defp station_record_vars(_id), do: {:error, :invalid_station_id}

  defp clear_station_access_fields(%{"id" => id} = station) do
    query =
      "UPDATE ONLY type::record($table, $record_id) SET access_token_hash = NONE, pin = NONE;"

    result =
      with {:ok, vars} <- station_record_vars(id) do
        SurrealDB.one(query, vars)
      end

    case result do
      {:ok, updated} when is_map(updated) ->
        updated

      {:ok, _} ->
        station

      {:error, reason} ->
        Logger.warning(
          "Station #{id} deactivated, but clearing access fields failed: #{inspect(reason)}"
        )

        station
    end
  end

  def reset_station_pin(id, organizer_id) do
    pin = StationToken.generate_pin()
    nonce = StationToken.generate_nonce()

    sql = """
    UPDATE $id SET
      access_token_hash = $nonce,
      pin = $pin,
      is_active = true
    WHERE race.state = 'active';
    """

    with {:ok, station} when is_map(station) <-
           SurrealDB.one("SELECT * FROM $id LIMIT 1;", %{id: id}),
         {:ok, _race} <- ensure_race_edit(station["race"], organizer_id) do
      case SurrealDB.one(sql, %{id: id, pin: pin, nonce: nonce}) do
        {:ok, station} when is_map(station) ->
          {:ok, station}

        {:ok, nil} ->
          {:error, :not_found}

        err ->
          err
      end
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "Lookup a station by id, only if active and race not closed. Used by station-auth plug."
  def get_active_station(id) do
    sql = """
    SELECT *, race.state AS race_state
    FROM $id
    WHERE is_active = true AND race.state = 'active'
    LIMIT 1;
    """

    case SurrealDB.one(sql, %{id: id}) do
      {:ok, station} when is_map(station) -> {:ok, station}
      _ -> {:error, :not_found}
    end
  end

  def authenticate_station_pin(id, pin) when is_binary(pin) do
    with {:ok, station} <- get_active_station(id),
         true <- station["pin"] == pin do
      {:ok, station}
    else
      _ -> {:error, :invalid_pin}
    end
  end

  def authenticate_station_pin(_id, _pin), do: {:error, :invalid_pin}

  defp ensure_race_edit(race_id, organizer_id) do
    case race_access(race_id, organizer_id) do
      {:ok, race, role} when role in ["owner", "edit"] -> {:ok, put_access(race, role)}
      {:ok, _race, "read"} -> {:error, :forbidden}
      _ -> {:error, :not_found}
    end
  end

  defp ensure_race_draft_edit(race_id, organizer_id) do
    case ensure_race_edit(race_id, organizer_id) do
      {:ok, %{"state" => "draft"} = race} -> {:ok, race}
      {:ok, _race} -> {:error, :race_not_draft}
      err -> err
    end
  end

  defp race_access(race_id, organizer_id) do
    with {:ok, race} when is_map(race) <-
           SurrealDB.one("SELECT * FROM $id LIMIT 1;", %{id: race_id}) do
      cond do
        race["owner"] == organizer_id ->
          {:ok, race, "owner"}

        admin?(organizer_id) ->
          {:ok, race, "edit"}

        true ->
          case SurrealDB.one(
                 "SELECT role FROM race_member WHERE race = $race AND organizer = $organizer LIMIT 1;",
                 %{race: race_id, organizer: organizer_id}
               ) do
            {:ok, %{"role" => role}} when role in ["read", "edit"] -> {:ok, race, role}
            _ -> {:error, :not_found}
          end
      end
    else
      _ -> {:error, :not_found}
    end
  end

  defp put_access(race, role) when is_map(race), do: Map.put(race, "access_role", role)

  defp access_role(%{"owner" => organizer_id}, organizer_id), do: "owner"
  defp access_role(_race, _organizer_id), do: "edit"

  defp admin?(organizer_id) do
    case Accounts.get_organizer(organizer_id) do
      %{"is_admin" => true} -> true
      _ -> false
    end
  end

  defp with_member_organizer(%{"organizer" => organizer_id} = member) do
    organizer = Accounts.get_organizer(organizer_id) || %{}

    member
    |> Map.put("organizer_id", organizer_id)
    |> Map.put("email", organizer["email"])
    |> Map.put("name", organizer["name"])
    |> Map.delete("organizer")
  end
end
