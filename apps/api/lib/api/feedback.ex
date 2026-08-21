defmodule Api.Feedback do
  @moduledoc """
  Slovní zpětná vazba od doprovodu hlídky.

  Jeden záznam `patrol_feedback` na hlídku (UNIQUE index), autosave je
  upsert. Souběh dvou zařízení řeší lock s explicitním převzetím — žádné
  TTL, lock se čistí jen převzetím a submitem. Viz docs/patrol-feedback-plan.md.
  """

  alias Api.{SurrealDB, AuditLog, Races}

  # Okno pro zápis po uzavření závodu; reopen ho pro danou hlídku
  # prodlužuje (max(closed_at, reopened_at) + 12 h).
  @window_hours 12

  # ---------- lookup / auth ----------

  @doc "Lookup hlídky pro feedback login — bez filtru stavu, vrací i race pole."
  def get_patrol_for_login(patrol_id) do
    sql = """
    SELECT *, race.state AS race_state, race.name AS race_name,
           race.closed_at AS race_closed_at,
           race.feedback_enabled AS feedback_enabled,
           race.feedback_positive_count AS feedback_positive_count,
           race.feedback_negative_count AS feedback_negative_count
    FROM $id
    LIMIT 1;
    """

    case SurrealDB.one(sql, %{id: patrol_id}) do
      {:ok, patrol} when is_map(patrol) -> {:ok, patrol}
      _ -> {:error, :not_found}
    end
  end

  def authenticate_patrol_pin(patrol_id, pin) when is_binary(pin) do
    case get_patrol_for_login(patrol_id) do
      {:ok, patrol} ->
        cond do
          patrol["feedback_enabled"] != true ->
            {:error, :feedback_disabled}

          # Stav před PINem — správný PIN v `ready` nesmí dostat „špatný PIN".
          patrol["race_state"] in ["draft", "ready"] ->
            {:error, {:race_not_started, patrol}}

          patrol["race_state"] == "closed" and not within_window?(patrol["race_closed_at"], nil) ->
            {:error, :feedback_window_closed}

          is_binary(patrol["feedback_pin"]) and patrol["feedback_pin"] == pin ->
            {:ok, patrol}

          true ->
            {:error, :invalid_pin}
        end

      _ ->
        {:error, :invalid_pin}
    end
  end

  def authenticate_patrol_pin(_patrol_id, _pin), do: {:error, :invalid_pin}

  @doc "Lookup pro plug — token je platný jen dokud sedí nonce a feedback je zapnutý."
  def get_patrol_for_token(patrol_id) do
    get_patrol_for_login(patrol_id)
  end

  # ---------- okno ----------

  @doc """
  Zápis je povolen, dokud závod běží, nebo do `closed_at + 12 h`;
  reopen okno pro danou hlídku prodlužuje (`reopened_at + 12 h`).
  """
  def ensure_feedback_open(patrol, record) do
    cond do
      patrol["feedback_enabled"] != true -> {:error, :feedback_disabled}
      patrol["race_state"] in ["draft", "ready"] -> {:error, :race_not_started}
      patrol["race_state"] == "active" -> :ok
      within_window?(patrol["race_closed_at"], record && record["reopened_at"]) -> :ok
      true -> {:error, :feedback_window_closed}
    end
  end

  defp within_window?(closed_at, reopened_at) do
    deadline =
      [closed_at, reopened_at]
      |> Enum.map(&parse_datetime/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.max(DateTime, fn -> nil end)

    case deadline do
      nil -> false
      dt -> DateTime.compare(DateTime.utc_now(), DateTime.add(dt, @window_hours, :hour)) != :gt
    end
  end

  defp parse_datetime(nil), do: nil

  defp parse_datetime(value) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      {:ok, dt, _offset} -> dt
      _ -> nil
    end
  end

  defp parse_datetime(%DateTime{} = dt), do: dt
  defp parse_datetime(_), do: nil

  # ---------- záznam ----------

  def get_record(patrol_id) do
    case SurrealDB.one(
           "SELECT * FROM patrol_feedback WHERE patrol = $patrol LIMIT 1;",
           %{patrol: patrol_id}
         ) do
      {:ok, record} when is_map(record) -> {:ok, record}
      {:ok, nil} -> {:ok, nil}
      err -> err
    end
  end

  @doc """
  Autosave draftu. Lock: prázdný → claim; můj → uložit; cizí → 409.
  První autosave do prázdného záznamu loguje `feedback.started`
  (autosave samotný se neloguje).
  """
  def save_draft(patrol, positives, negatives, device_id)
      when is_binary(device_id) and device_id != "" do
    patrol_id = patrol["id"]
    race_id = patrol["race"]

    with {:ok, record} <- get_record(patrol_id),
         :ok <- ensure_feedback_open(patrol, record),
         :ok <- ensure_draft_state(record),
         :ok <- ensure_lock(record, device_id) do
      case record do
        nil ->
          result =
            SurrealDB.one(
              """
              CREATE patrol_feedback SET
                patrol = $patrol,
                race = $race,
                positives = $positives,
                negatives = $negatives,
                lock_device = type::string($device),
                lock_at = time::now(),
                updated_at = time::now();
              """,
              %{
                patrol: patrol_id,
                race: race_id,
                positives: positives,
                negatives: negatives,
                device: device_id
              }
            )

          with {:ok, created} when is_map(created) <- result do
            AuditLog.log("feedback.started", patrol_id, race_id, created["id"], %{
              patrol: patrol_id,
              device_id: device_id
            })

            {:ok, created}
          end

        %{"id" => id} ->
          lock_device = Map.get(record, "lock_device")
          claim = if lock_device in [nil, ""], do: ", lock_at = time::now()", else: ""

          SurrealDB.one(
            """
            UPDATE $id SET
              positives = $positives,
              negatives = $negatives,
              lock_device = type::string($device)#{claim},
              updated_at = time::now();
            """,
            %{id: id, positives: positives, negatives: negatives, device: device_id}
          )
      end
    end
  end

  def save_draft(_patrol, _positives, _negatives, _device_id), do: {:error, :missing_device}

  defp ensure_draft_state(nil), do: :ok
  defp ensure_draft_state(%{"state" => "draft"}), do: :ok
  defp ensure_draft_state(_), do: {:error, :feedback_submitted}

  defp ensure_lock(nil, _device_id), do: :ok

  defp ensure_lock(record, device_id) when is_map(record) do
    # Po `lock_device = NONE` (submit, reopen, takeover) SurrealDB pole
    # ze záznamu odstraní úplně — proto Map.get, ne pattern match na klíč.
    case Map.get(record, "lock_device") do
      empty when empty in [nil, ""] -> :ok
      ^device_id -> :ok
      _ -> {:error, {:locked_by_other_device, Map.get(record, "lock_at")}}
    end
  end

  @doc "Explicitní převzetí zámku druhým zařízením."
  def takeover(patrol, device_id) when is_binary(device_id) and device_id != "" do
    patrol_id = patrol["id"]

    with {:ok, record} <- get_record(patrol_id),
         :ok <- ensure_feedback_open(patrol, record) do
      case record do
        nil ->
          # Není co přebírat — první autosave lock založí sám.
          {:error, :not_found}

        %{"id" => id} ->
          from_device = Map.get(record, "lock_device")

          result =
            SurrealDB.one(
              "UPDATE $id SET lock_device = type::string($device), lock_at = time::now();",
              %{id: id, device: device_id}
            )

          with {:ok, updated} when is_map(updated) <- result do
            AuditLog.log("feedback.taken_over", patrol_id, patrol["race"], id, %{
              patrol: patrol_id,
              from_device: from_device,
              to_device: device_id
            })

            {:ok, updated}
          end
      end
    end
  end

  def takeover(_patrol, _device_id), do: {:error, :missing_device}

  @doc "Uzavření a odeslání. Prázdná pole neblokují (validace je jen FE upozornění)."
  def submit(patrol, device_id) do
    patrol_id = patrol["id"]

    with {:ok, record} when is_map(record) <- get_record(patrol_id),
         :ok <- ensure_feedback_open(patrol, record),
         :ok <- ensure_draft_state(record),
         :ok <- ensure_lock(record, device_id || record["lock_device"] || "") do
      result =
        SurrealDB.one(
          """
          UPDATE $id SET
            state = 'submitted',
            submitted_at = time::now(),
            lock_device = NONE,
            lock_at = NONE,
            updated_at = time::now();
          """,
          %{id: record["id"]}
        )

      with {:ok, submitted} when is_map(submitted) <- result do
        action =
          if (record["reopen_count"] || 0) > 0, do: "feedback.resubmitted", else: "feedback.submitted"

        AuditLog.log(action, patrol_id, patrol["race"], record["id"], %{
          patrol: patrol_id,
          positives: submitted["positives"],
          negatives: submitted["negatives"],
          reopen_count: submitted["reopen_count"]
        })

        {:ok, submitted}
      end
    else
      {:ok, nil} -> {:error, :not_found}
      err -> err
    end
  end

  # ---------- organizátor ----------

  @doc """
  Odemkne odevzdaný záznam k editaci. Obsah editovat nejde — do logu se
  ukládá snapshot před odemčením, takže každá verze textu je dohledatelná.
  """
  def reopen(feedback_id, organizer_id, reason) do
    with {:ok, record} when is_map(record) <-
           SurrealDB.one("SELECT * FROM $id LIMIT 1;", %{id: feedback_id}),
         {:ok, _race} <- Races.ensure_race_edit(record["race"], organizer_id) do
      if record["state"] != "submitted" do
        {:error, :not_submitted}
      else
        result =
          SurrealDB.one(
            """
            UPDATE $id SET
              state = 'draft',
              reopened_at = time::now(),
              reopened_by = type::string($organizer),
              reopen_count = reopen_count + 1,
              lock_device = NONE,
              lock_at = NONE,
              updated_at = time::now();
            """,
            %{id: feedback_id, organizer: organizer_id}
          )

        with {:ok, reopened} when is_map(reopened) <- result do
          AuditLog.log("feedback.reopened", organizer_id, record["race"], feedback_id, %{
            patrol: record["patrol"],
            reason: reason,
            positives: record["positives"],
            negatives: record["negatives"]
          })

          {:ok, reopened}
        end
      end
    else
      {:ok, nil} -> {:error, :not_found}
      {:error, _} = err -> err
      _ -> {:error, :not_found}
    end
  end

  @doc "Přehled stavů zpětné vazby pro dashboard organizátora."
  def list_for_race(race_id, organizer_id) do
    with {:ok, _race} <- Races.get_race(race_id, organizer_id) do
      SurrealDB.all(
        """
        SELECT id, patrol, state, submitted_at, reopen_count, updated_at,
               lock_device != NONE AS locked
        FROM patrol_feedback
        WHERE race = $race;
        """,
        %{race: race_id}
      )
    end
  end

  @doc "Záznamy včetně obsahu pro organizátorské výsledky (bez lock polí)."
  def list_records_for_race(race_id) do
    SurrealDB.all(
      """
      SELECT id, patrol, positives, negatives, state, submitted_at, reopen_count, updated_at
      FROM patrol_feedback
      WHERE race = $race;
      """,
      %{race: race_id}
    )
  end

  @doc "Odevzdané záznamy pro výsledky (bez lock polí)."
  def list_submitted_for_race(race_id) do
    SurrealDB.all(
      """
      SELECT id, patrol, positives, negatives, submitted_at
      FROM patrol_feedback
      WHERE race = $race AND state = 'submitted';
      """,
      %{race: race_id}
    )
  end
end
