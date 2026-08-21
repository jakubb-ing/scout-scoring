defmodule ApiWeb.AuthAPITest do
  @moduledoc "Přihlášení organizátora, JWT a správa účtů."
  use Api.APICase, async: false

  defp create_login(attrs \\ %{}) do
    email = Map.get(attrs, :email, "user-#{System.unique_integer([:positive])}@example.com")
    password = Map.get(attrs, :password, "tajneheslo123")

    {:ok, organizer} =
      SurrealDB.one(
        """
        CREATE organizer SET email = $email, name = $name,
          password_hash = $hash, is_admin = $is_admin;
        """,
        %{
          email: email,
          name: Map.get(attrs, :name, "Testovací"),
          hash: Bcrypt.hash_pwd_salt(password),
          is_admin: Map.get(attrs, :is_admin, false)
        }
      )

    {organizer["id"], email, password}
  end

  describe "POST /api/auth/login" do
    test "se správnými údaji vrátí token", %{conn: conn} do
      {_id, email, password} = create_login()

      conn = post(conn, "/api/auth/login", %{"email" => email, "password" => password})

      assert %{"token" => token} = json_response(conn, 200)
      assert is_binary(token)
    end

    test "se špatným heslem vrátí 401", %{conn: conn} do
      {_id, email, _password} = create_login()

      conn = post(conn, "/api/auth/login", %{"email" => email, "password" => "spatne"})
      assert json_response(conn, 401)
    end

    test "neexistující email vrátí 401", %{conn: conn} do
      conn = post(conn, "/api/auth/login", %{"email" => "nikdo@example.com", "password" => "x"})
      assert json_response(conn, 401)
    end
  end

  describe "GET /api/auth/me" do
    test "vrátí přihlášeného organizátora", %{conn: conn} do
      {id, email, _password} = create_login()

      conn = conn |> as_organizer(id) |> get("/api/auth/me")

      assert %{"email" => ^email} = json_response(conn, 200)
    end

    test "bez tokenu vrátí 401", %{conn: conn} do
      assert json_response(get(conn, "/api/auth/me"), 401)
    end

    test "token nevydaný naší aplikací neprojde", %{conn: conn} do
      conn =
        conn
        |> put_req_header("authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.e30.podvrh")
        |> get("/api/auth/me")

      assert json_response(conn, 401)
    end

    test "heslo se v odpovědi neposílá", %{conn: conn} do
      {id, _email, _password} = create_login()

      conn = conn |> as_organizer(id) |> get("/api/auth/me")
      body = json_response(conn, 200)

      refute Map.has_key?(body, "password_hash")
      refute Map.has_key?(body, "password")
    end
  end

  describe "správa uživatelů" do
    test "běžný organizátor nesmí zakládat uživatele", %{conn: conn} do
      {id, _email, _password} = create_login()

      conn =
        conn
        |> as_organizer(id)
        |> post("/api/auth/users", %{"email" => "novy@example.com", "name" => "Nový"})

      assert conn.status in [403, 401]
    end

    test "admin uživatele založit smí a dostane vygenerované heslo", %{conn: conn} do
      {admin_id, _email, _password} = create_login(%{is_admin: true})

      conn =
        conn
        |> as_organizer(admin_id)
        |> post("/api/auth/users", %{"email" => "novy@example.com", "name" => "Nový"})

      assert %{"organizer" => %{"email" => "novy@example.com"}, "password" => password} =
               json_response(conn, 201)

      assert String.length(password) > 8
    end

    test "vytvořený uživatel se rovnou přihlásí vygenerovaným heslem", %{conn: conn} do
      {admin_id, _email, _password} = create_login(%{is_admin: true})

      created =
        conn
        |> as_organizer(admin_id)
        |> post("/api/auth/users", %{"email" => "prihlaseni@example.com", "name" => "Nový"})
        |> json_response(201)

      conn =
        post(build_conn(), "/api/auth/login", %{
          "email" => "prihlaseni@example.com",
          "password" => created["password"]
        })

      assert %{"token" => _} = json_response(conn, 200)
    end
  end
end
