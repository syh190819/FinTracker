use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;
use sqlx::PgPool;

use crate::handlers::plans::{Plan, PLAN_COLUMNS};
use crate::handlers::todos::{Todo, TODO_COLUMNS};

#[derive(Debug, Serialize)]
pub struct WorkbenchSummary {
    pub month_total: f64,
    pub month_budget: f64,
    pub today_todo_count: i64,
    pub open_todo_count: i64,
    pub active_plan_count: i64,
    pub recent_todos: Vec<Todo>,
    pub active_plans: Vec<Plan>,
}

pub async fn summary(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
) -> Result<Json<WorkbenchSummary>, StatusCode> {
    let now = chrono::Local::now();
    let month = now.format("%Y-%m").to_string();
    let today = now.format("%Y-%m-%d").to_string();

    let month_total: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses \
         WHERE user_id = $1 AND deleted_at IS NULL AND to_char(date, 'YYYY-MM') = $2",
    )
    .bind(user_id)
    .bind(&month)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let month_budget: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM budgets \
         WHERE user_id = $1 AND deleted_at IS NULL AND month = $2",
    )
    .bind(user_id)
    .bind(&month)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let today_todo_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM todos \
         WHERE user_id = $1 AND deleted_at IS NULL AND done = false AND due_date <= $2::date",
    )
    .bind(user_id)
    .bind(&today)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let open_todo_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM todos WHERE user_id = $1 AND deleted_at IS NULL AND done = false",
    )
    .bind(user_id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let active_plan_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM plans WHERE user_id = $1 AND deleted_at IS NULL AND archived = false",
    )
    .bind(user_id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let recent_todos = sqlx::query_as::<_, Todo>(&format!(
        "SELECT {} FROM todos t LEFT JOIN plans p ON p.id = t.plan_id AND p.deleted_at IS NULL \
         WHERE t.user_id = $1 AND t.deleted_at IS NULL AND t.done = false \
         ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC LIMIT 5",
        TODO_COLUMNS
    ))
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let active_plans = sqlx::query_as::<_, Plan>(&format!(
        "SELECT {} FROM plans p LEFT JOIN todos t ON t.plan_id = p.id \
         WHERE p.user_id = $1 AND p.deleted_at IS NULL AND p.archived = false \
         GROUP BY p.id ORDER BY p.deadline ASC NULLS LAST, p.created_at DESC LIMIT 5",
        PLAN_COLUMNS
    ))
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(WorkbenchSummary {
        month_total,
        month_budget,
        today_todo_count,
        open_todo_count,
        active_plan_count,
        recent_todos,
        active_plans,
    }))
}
