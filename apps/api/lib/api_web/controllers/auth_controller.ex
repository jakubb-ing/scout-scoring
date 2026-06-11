defmodule ApiWeb.AuthController do
  use ApiWeb, :controller

  alias Api.{Accounts, Auth.Guardian, AuditLog}

  plug ApiWeb.Plugs.RateLimit,
       [bucket: "auth_login", limit: 10, window_ms: 60_000, by_param: "email"]
       when action in [:login]

  def login(conn, %{"email" => email, "password" => password}) do
    case Accounts.authenticate(email, password) do
      {:ok, org} ->
        {:ok, token, _claims} = Guardian.encode_and_sign(org, %{}, ttl: {12, :hours})
        AuditLog.log("auth.login", org["id"], nil, org["id"])

        json(conn, %{
          token: token,
          organizer: organizer_json(org)
        })

      {:error, :invalid_credentials} ->
        conn
        |> put_status(401)
        |> json(%{error: "invalid_credentials"})
    end
  end

  def login(conn, _), do: conn |> put_status(400) |> json(%{error: "missing_fields"})

  def me(conn, _) do
    org = conn.assigns.organizer
    json(conn, organizer_json(org))
  end

  def invite(conn, params) do
    if admin?(conn) do
      case Accounts.invite(conn.assigns.organizer, params) do
        {:ok, org} -> conn |> put_status(201) |> json(%{id: org["id"], email: org["email"]})
        _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
      end
    else
      forbidden(conn)
    end
  end

  def users(conn, _) do
    {:ok, organizers} = Accounts.list_organizers()
    json(conn, %{data: Enum.map(organizers, &organizer_json/1)})
  end

  def create_user(conn, params) do
    if admin?(conn) do
      case Accounts.create_organizer(conn.assigns.organizer, params) do
        {:ok, org} ->
          conn
          |> put_status(201)
          |> json(%{
            organizer: organizer_json(org),
            password: org["password"]
          })

        _ ->
          conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
      end
    else
      forbidden(conn)
    end
  end

  def show_user(conn, %{"id" => id}) do
    if admin?(conn) do
      case Accounts.get_organizer(id) do
        nil -> not_found(conn)
        org -> json(conn, organizer_json(org))
      end
    else
      forbidden(conn)
    end
  end

  def update_user(conn, %{"id" => id, "is_admin" => is_admin}) when is_boolean(is_admin) do
    if admin?(conn) do
      case Accounts.update_admin(id, is_admin) do
        {:ok, org} when is_map(org) -> json(conn, organizer_json(org))
        {:error, :last_admin} -> conn |> put_status(409) |> json(%{error: "last_admin"})
        _ -> conn |> put_status(422) |> json(%{error: "unprocessable_entity"})
      end
    else
      forbidden(conn)
    end
  end

  def reset_user_password(conn, %{"id" => id}) do
    if admin?(conn) do
      case Accounts.reset_password(id) do
        {:ok, org} ->
          json(conn, %{organizer: organizer_json(org), password: org["password"]})

        _ ->
          not_found(conn)
      end
    else
      forbidden(conn)
    end
  end

  def delete_user(conn, %{"id" => id}) do
    if admin?(conn) do
      case Accounts.delete_organizer(id) do
        {:ok, :deleted} ->
          send_resp(conn, 204, "")

        {:error, :organizer_owns_races} ->
          conn |> put_status(409) |> json(%{error: "organizer_owns_races"})

        {:error, :last_admin} ->
          conn |> put_status(409) |> json(%{error: "last_admin"})

        _ ->
          not_found(conn)
      end
    else
      forbidden(conn)
    end
  end

  def user_races(conn, %{"id" => id}) do
    if admin?(conn) do
      case Accounts.list_race_assignments(id) do
        {:ok, assignments} -> json(conn, %{data: assignments})
        _ -> not_found(conn)
      end
    else
      forbidden(conn)
    end
  end

  defp admin?(conn), do: conn.assigns.organizer["is_admin"] == true

  defp organizer_json(org) do
    %{
      id: org["id"],
      email: org["email"],
      name: org["name"],
      is_admin: org["is_admin"] == true
    }
  end

  defp forbidden(conn), do: conn |> put_status(403) |> json(%{error: "forbidden"})
  defp not_found(conn), do: conn |> put_status(404) |> json(%{error: "not_found"})
end
