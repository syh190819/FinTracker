mod db;
mod handlers {
    pub mod auth;
    pub mod budgets;
    pub mod categories;
    pub mod deposits;
    pub mod expenses;
    pub mod import_export;
    pub mod plans;
    pub mod sharing;
    pub mod statistics;
    pub mod todos;
    pub mod workbench;
}
mod middleware;
mod models {
    pub mod user;
}

use axum::{
    middleware as axum_middleware,
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "fintracker_backend=debug,tower_http=debug".into()),
        )
        .init();

    dotenvy::dotenv().ok();

    let database_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL 环境变量必须设置");
    let pool = db::init_pool(&database_url).await;

    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/api/health", get(|| async { "OK" }))
        .route("/api/register", post(handlers::auth::register))
        .route("/api/login", post(handlers::auth::login));

    // Protected routes (auth required)
    let protected_routes = Router::new()
        // Categories
        .route("/api/categories", get(handlers::categories::list))
        .route("/api/categories", post(handlers::categories::create))
        .route(
            "/api/categories/{id}",
            put(handlers::categories::update),
        )
        .route(
            "/api/categories/{id}",
            delete(handlers::categories::delete),
        )
        // Expenses
        .route("/api/expenses", get(handlers::expenses::list))
        .route("/api/expenses", post(handlers::expenses::create))
        .route(
            "/api/expenses/{id}",
            put(handlers::expenses::update),
        )
        .route(
            "/api/expenses/{id}",
            delete(handlers::expenses::delete),
        )
        // Budgets
        .route("/api/budgets", get(handlers::budgets::list))
        .route("/api/budgets", post(handlers::budgets::create))
        .route(
            "/api/budgets/{id}",
            put(handlers::budgets::update),
        )
        .route(
            "/api/budgets/{id}",
            delete(handlers::budgets::delete),
        )
        // Deposit Plans
        .route(
            "/api/deposit-plans",
            get(handlers::deposits::list_plans),
        )
        .route(
            "/api/deposit-plans",
            post(handlers::deposits::create_plan),
        )
        .route(
            "/api/deposit-plans/{id}",
            put(handlers::deposits::update_plan),
        )
        .route(
            "/api/deposit-plans/{id}",
            delete(handlers::deposits::delete_plan),
        )
        // Deposit Transactions
        .route(
            "/api/deposit-plans/{plan_id}/transactions",
            get(handlers::deposits::list_transactions),
        )
        .route(
            "/api/deposit-plans/{plan_id}/transactions",
            post(handlers::deposits::create_transaction),
        )
        // Sharing
        .route("/api/share/invite", post(handlers::sharing::invite))
        .route("/api/share/accept", post(handlers::sharing::accept))
        .route(
            "/api/share/relationships",
            get(handlers::sharing::relationships),
        )
        .route(
            "/api/share/{id}/scope",
            put(handlers::sharing::update_scope),
        )
        .route("/api/share/{id}", delete(handlers::sharing::delete))
        // Todos
        .route("/api/todos", get(handlers::todos::list))
        .route("/api/todos", post(handlers::todos::create))
        .route("/api/todos/{id}", put(handlers::todos::update))
        .route("/api/todos/{id}", delete(handlers::todos::delete))
        // Plans
        .route("/api/plans", get(handlers::plans::list))
        .route("/api/plans", post(handlers::plans::create))
        .route("/api/plans/{id}", put(handlers::plans::update))
        .route("/api/plans/{id}", delete(handlers::plans::delete))
        // Workbench
        .route(
            "/api/workbench/summary",
            get(handlers::workbench::summary),
        )
        // Statistics
        .route(
            "/api/statistics/monthly",
            get(handlers::statistics::monthly),
        )
        .route(
            "/api/statistics/category",
            get(handlers::statistics::category),
        )
        .route(
            "/api/statistics/budget-vs-actual",
            get(handlers::statistics::budget_vs_actual),
        )
        // Import / Export
        .route("/api/export", get(handlers::import_export::export_all))
        .route("/api/import", post(handlers::import_export::import_all))
        .layer(axum_middleware::from_fn(middleware::jwt::auth_middleware));

    let app = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(CorsLayer::permissive())
        .with_state(pool);

    let addr = std::env::var("SERVER_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
    tracing::info!("FinTracker 服务启动于 {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
