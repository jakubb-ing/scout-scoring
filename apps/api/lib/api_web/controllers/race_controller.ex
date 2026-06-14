defmodule ApiWeb.RaceController do
  use ApiWeb, :controller

  alias Api.Races

  defp owner(conn), do: conn.assigns.organizer["id"]

  def index(conn, _) do
    {:ok, races} = Races.list_races(owner(conn))
    json(conn, %{data: races})
  end

  def show(conn, %{"id" => id}) do
    case Races.get_race(id, owner(conn)) do
      {:ok, race} -> json(conn, race)
      _ -> not_found(conn)
    end
  end

  def create(conn, params) do
    case Races.create_race(owner(conn), params) do
      {:ok, race} -> conn |> put_status(201) |> json(race)
      _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def update(conn, %{"id" => id} = params) do
    case Races.update_race(id, owner(conn), params) do
      {:ok, race} -> json(conn, race)
      _ -> not_found(conn)
    end
  end

  def activate(conn, %{"id" => id}) do
    case Races.activate_race(id, owner(conn)) do
      {:ok, payload} -> json(conn, payload)
      _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def reissue_tokens(conn, %{"id" => id}) do
    case Races.reissue_station_tokens(id, owner(conn)) do
      {:ok, payload} -> json(conn, payload)
      {:error, :forbidden} -> conn |> put_status(403) |> json(%{error: "forbidden"})
      _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
    end
  end

  def close(conn, %{"id" => id}) do
    case Races.close_race(id, owner(conn)) do
      {:ok, race} -> json(conn, race)
      _ -> not_found(conn)
    end
  end

  def regenerate_public_code(conn, %{"id" => id}) do
    case Races.regenerate_public_code(id, owner(conn)) do
      {:ok, race} -> json(conn, race)
      {:error, :forbidden} -> conn |> put_status(403) |> json(%{error: "forbidden"})
      _ -> not_found(conn)
    end
  end

  defp not_found(conn), do: conn |> put_status(404) |> json(%{error: "not_found"})
end
