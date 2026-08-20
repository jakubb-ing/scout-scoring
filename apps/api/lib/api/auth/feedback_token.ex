defmodule Api.Auth.FeedbackToken do
  @moduledoc """
  Patrol-feedback access tokens for the patrol's accompanying adult.
  Signed with Phoenix.Token using the shared station secret but a distinct
  salt, so the two token domains can never be swapped. Payload:
  `%{patrol_id: "patrol:xxx", race_id: "race:yyy", nonce: "..."}`.
  """

  @salt "patrol-feedback/v1"

  def sign(patrol_id, race_id, nonce, max_age_seconds) do
    Phoenix.Token.sign(
      secret(),
      @salt,
      %{pid: to_string(patrol_id), rid: to_string(race_id), n: to_string(nonce)},
      max_age: max_age_seconds
    )
  end

  def verify(token, max_age_seconds) do
    case Phoenix.Token.verify(secret(), @salt, token, max_age: max_age_seconds) do
      {:ok, %{pid: pid, rid: rid, n: nonce}} ->
        {:ok, %{patrol_id: pid, race_id: rid, nonce: nonce}}

      {:error, _} = err ->
        err
    end
  end

  defp secret, do: Application.fetch_env!(:api, :station_token_secret)
end
