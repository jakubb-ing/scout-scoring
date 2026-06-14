defmodule Api.Auth.StationToken do
  @moduledoc """
  Station access tokens. Signed with Phoenix.Token (HMAC-SHA256) using a
  dedicated secret. Payload:
  `%{station_id: "station:xxx", race_id: "race:yyy", nonce: "..."}`.
  """

  @salt "station-token/v1"

  def sign(station_id, race_id, nonce, max_age_seconds) do
    Phoenix.Token.sign(
      secret(),
      @salt,
      %{sid: to_string(station_id), rid: to_string(race_id), n: to_string(nonce)},
      max_age: max_age_seconds
    )
  end

  def verify(token, max_age_seconds) do
    case Phoenix.Token.verify(secret(), @salt, token, max_age: max_age_seconds) do
      {:ok, %{sid: sid, rid: rid, n: nonce}} ->
        {:ok, %{station_id: sid, race_id: rid, nonce: nonce}}

      {:ok, %{sid: _sid, rid: _rid, s: _legacy_secret}} ->
        {:error, :legacy_token}

      {:error, _} = err ->
        err
    end
  end

  @doc "Generates a 6-digit numeric PIN (zero-padded)."
  def generate_pin do
    (:rand.uniform(1_000_000) - 1)
    |> Integer.to_string()
    |> String.pad_leading(6, "0")
  end

  # Unambiguous alphabet: no 0/O/1/I/L so codes are easy to read out loud.
  @public_code_alphabet ~c"ABCDEFGHJKMNPQRSTUVWXYZ23456789"

  @doc "Generates a short, human-friendly public results access code."
  def generate_public_code(length \\ 8) do
    alphabet = @public_code_alphabet
    size = length(alphabet)

    Enum.map_join(1..length, "", fn _ ->
      <<Enum.at(alphabet, :rand.uniform(size) - 1)>>
    end)
  end

  def generate_nonce do
    :crypto.strong_rand_bytes(12) |> Base.url_encode64(padding: false)
  end

  defp secret, do: Application.fetch_env!(:api, :station_token_secret)
end
