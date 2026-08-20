defmodule ApiWeb.PatrolController do
  use ApiWeb, :controller
  alias Api.Races

  defp owner(conn), do: conn.assigns.organizer["id"]

  def index(conn, %{"race_id" => rid}) do
    case Races.list_patrols(rid, owner(conn)) do
      {:ok, data} -> json(conn, %{data: data})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def create(conn, %{"race_id" => rid} = params) do
    case Races.create_patrol(rid, owner(conn), params) do
      {:ok, p} -> conn |> put_status(201) |> json(p)
      {:error, :race_not_draft} -> conn |> put_status(409) |> json(%{error: "race_not_draft"})
      _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def bulk_create(conn, %{"race_id" => rid, "patrols" => patrols}) when is_list(patrols) do
    case Races.bulk_create_patrols(rid, owner(conn), patrols) do
      {:ok, created} -> conn |> put_status(201) |> json(%{created: length(created)})
      {:partial, report} -> conn |> put_status(207) |> json(report)
      {:error, :race_not_draft} -> conn |> put_status(409) |> json(%{error: "race_not_draft"})
      _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def update(conn, %{"id" => id} = params) do
    case Races.update_patrol(id, owner(conn), params) do
      {:ok, p} -> json(conn, p)
      {:error, :race_not_draft} -> conn |> put_status(409) |> json(%{error: "race_not_draft"})
      {:error, :field_locked} -> conn |> put_status(409) |> json(%{error: "field_locked"})
      {:error, :forbidden} -> conn |> put_status(403) |> json(%{error: "forbidden"})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def withdraw(conn, %{"id" => id} = params) do
    case Races.withdraw_patrol(id, owner(conn), params["reason"]) do
      {:ok, p} -> json(conn, p)
      {:error, :race_not_running} -> conn |> put_status(409) |> json(%{error: "race_not_running"})
      {:error, :forbidden} -> conn |> put_status(403) |> json(%{error: "forbidden"})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def restore(conn, %{"id" => id}) do
    case Races.restore_patrol(id, owner(conn)) do
      {:ok, p} -> json(conn, p)
      {:error, :race_not_running} -> conn |> put_status(409) |> json(%{error: "race_not_running"})
      {:error, :forbidden} -> conn |> put_status(403) |> json(%{error: "forbidden"})
      _ -> conn |> put_status(404) |> json(%{error: "not_found"})
    end
  end

  def delete(conn, %{"id" => id}) do
    case Races.delete_patrol(id, owner(conn)) do
      {:ok, :deleted} -> send_resp(conn, 204, "")
      {:error, :race_not_draft} -> conn |> put_status(409) |> json(%{error: "race_not_draft"})
      {:error, :forbidden} -> conn |> put_status(403) |> json(%{error: "forbidden"})
      {:error, :not_found} -> conn |> put_status(404) |> json(%{error: "not_found"})
      _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end
end
