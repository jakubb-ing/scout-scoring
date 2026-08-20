defmodule ApiWeb.FeedbackAdminController do
  @moduledoc "Organizer-facing endpoints for patrol feedback (přehled, reopen)."
  use ApiWeb, :controller

  alias Api.Feedback

  defp owner(conn), do: conn.assigns.organizer["id"]

  def index(conn, %{"race_id" => race_id}) do
    case Feedback.list_for_race(race_id, owner(conn)) do
      {:ok, data} -> json(conn, %{data: data})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  # Admin obsah editovat nesmí — reopen jen odemyká; snapshot obsahu jde
  # do audit logu, takže je každá verze textu dohledatelná.
  def reopen(conn, %{"id" => id} = params) do
    case Feedback.reopen(id, owner(conn), params["reason"]) do
      {:ok, record} -> json(conn, record)
      {:error, :not_submitted} -> conn |> put_status(409) |> json(%{error: "not_submitted"})
      {:error, :forbidden} -> conn |> put_status(403) |> json(%{error: "forbidden"})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end
end
