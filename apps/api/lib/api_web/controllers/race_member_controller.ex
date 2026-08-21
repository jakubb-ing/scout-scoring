defmodule ApiWeb.RaceMemberController do
  use ApiWeb, :controller

  alias Api.Races

  defp owner(conn), do: conn.assigns.organizer["id"]

  def index(conn, %{"race_id" => race_id}) do
    case Races.list_race_members(race_id, owner(conn)) do
      {:ok, data} -> json(conn, %{data: data})
      {:error, :forbidden} -> forbidden(conn)
      _ -> not_found(conn)
    end
  end

  def create(conn, %{"race_id" => race_id} = params) do
    case Races.upsert_race_member(race_id, owner(conn), params) do
      {:ok, member} -> conn |> put_status(201) |> json(member)
      {:error, :invalid_member} -> conn |> put_status(422) |> json(%{error: "invalid_member"})
      {:error, :invalid_role} -> conn |> put_status(422) |> json(%{error: "invalid_role"})
      {:error, :forbidden} -> forbidden(conn)
      _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def update(conn, %{"id" => id} = params) do
    case Races.update_race_member(id, owner(conn), params) do
      {:ok, member} -> json(conn, member)
      {:error, :invalid_role} -> conn |> put_status(422) |> json(%{error: "invalid_role"})
      {:error, :forbidden} -> forbidden(conn)
      _ -> not_found(conn)
    end
  end

  def delete(conn, %{"id" => id}) do
    case Races.delete_race_member(id, owner(conn)) do
      {:ok, :deleted} -> send_resp(conn, 204, "")
      {:error, :forbidden} -> forbidden(conn)
      _ -> not_found(conn)
    end
  end

  defp not_found(conn), do: conn |> put_status(404) |> json(%{error: "not_found"})
  defp forbidden(conn), do: conn |> put_status(403) |> json(%{error: "forbidden"})
end
