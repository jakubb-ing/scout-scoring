defmodule ApiWeb.Router do
  use ApiWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :organizer_auth do
    plug ApiWeb.Plugs.AuthenticateOrganizer
  end

  pipeline :station_auth do
    plug ApiWeb.Plugs.AuthenticateStation
  end

  scope "/api", ApiWeb do
    pipe_through :api

    get "/health", HealthController, :show
    post "/auth/login", AuthController, :login
    get "/station/races", StationController, :races
    get "/station/races/:race_id/stations", StationController, :stations
    post "/station/login", StationController, :login
    get "/public/races/:race_id/results", PublicController, :results
  end

  scope "/api", ApiWeb do
    pipe_through [:api, :organizer_auth]

    get "/auth/me", AuthController, :me
    post "/auth/invite", AuthController, :invite
    get "/auth/users", AuthController, :users
    post "/auth/users", AuthController, :create_user
    get "/auth/users/:id", AuthController, :show_user
    put "/auth/users/:id", AuthController, :update_user
    delete "/auth/users/:id", AuthController, :delete_user
    post "/auth/users/:id/reset_password", AuthController, :reset_user_password
    get "/auth/users/:id/races", AuthController, :user_races

    get "/races", RaceController, :index
    post "/races", RaceController, :create
    get "/races/:id", RaceController, :show
    put "/races/:id", RaceController, :update
    post "/races/:id/activate", RaceController, :activate
    post "/races/:id/reissue_tokens", RaceController, :reissue_tokens
    post "/races/:id/close", RaceController, :close
    post "/races/:id/regenerate_public_code", RaceController, :regenerate_public_code
    get "/races/:race_id/members", RaceMemberController, :index
    post "/races/:race_id/members", RaceMemberController, :create
    put "/race-members/:id", RaceMemberController, :update
    delete "/race-members/:id", RaceMemberController, :delete

    get "/races/:race_id/categories", CategoryController, :index
    post "/races/:race_id/categories", CategoryController, :create
    delete "/categories/:id", CategoryController, :delete

    get "/races/:race_id/patrols", PatrolController, :index
    post "/races/:race_id/patrols", PatrolController, :create
    post "/races/:race_id/patrols/bulk", PatrolController, :bulk_create
    put "/patrols/:id", PatrolController, :update
    delete "/patrols/:id", PatrolController, :delete

    get "/races/:race_id/stations", StationAdminController, :index
    post "/races/:race_id/stations", StationAdminController, :create
    post "/races/:race_id/stations/bulk", StationAdminController, :bulk_create
    put "/stations/:id", StationAdminController, :update
    post "/stations/:id/reset_pin", StationAdminController, :reset_pin
    post "/stations/:id/deactivate", StationAdminController, :deactivate

    post "/races/:race_id/ai-import/extract", AIImportController, :extract
    post "/races/:race_id/ai-import/refine", AIImportController, :refine

    get "/races/:race_id/dashboard", DashboardController, :show
    get "/races/:race_id/leaderboard", DashboardController, :leaderboard
    get "/races/:race_id/results", DashboardController, :results
    get "/races/:race_id/audit", DashboardController, :audit
  end

  scope "/api/station", ApiWeb do
    pipe_through [:api, :station_auth]

    get "/me", StationController, :me
    get "/scores", StationController, :list_entries
    post "/scores", StationController, :upsert_entry
  end
end
