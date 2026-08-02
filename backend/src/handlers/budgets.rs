use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use sqlx::PgPool;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Budget {
    pub id: i32,
    pub user_id: i32,
    pub month: String,
    pub category: String,
    pub amount: f64,
    pub split_by_day: bool,
    pub deleted_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Deserialize)]
pub struct BudgetQuery {
    pub month: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBudget {
    pub month: String,
    pub category: String,
    pub amount: f64,
    pub split_by_day: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBudget {
    pub amount: Option<f64>,
    pub split_by_day: Option<bool>,
}

pub async fn list(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<BudgetQuery>,
) -> Result<Json<Vec<Budget>>, StatusCode> {
    if let Some(ref month) = query.month {
        // Validate month format YYYY-MM
        if month.len() != 7 || !month.contains('-') {
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
    }

    let mut sql = String::from(
        "SELECT id, user_id, month, category, CAST(amount AS DOUBLE PRECISION) as amount, split_by_day, deleted_at \
         FROM budgets WHERE deleted_at IS NULL AND user_id = $1",
    );

    if let Some(ref month) = query.month {
        sql.push_str(&format!(" AND month = '{}'", month));
    }

    sql.push_str(" ORDER BY category");

    let budgets = sqlx::query_as::<_, Budget>(&sql)
        .bind(user_id)
        .fetch_all(&db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(budgets))
}

pub async fn create(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(req): Json<CreateBudget>,
) -> Result<Json<Budget>, StatusCode> {
    if req.amount < 0.0 || req.month.len() != 7 || req.category.trim().is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let split_by_day = req.split_by_day.unwrap_or(true);

    let budget = sqlx::query_as::<_, Budget>(
        "INSERT INTO budgets (user_id, month, category, amount, split_by_day) \
         VALUES ($1, $2, $3, $4, $5) \
         ON CONFLICT (user_id, month, category) WHERE deleted_at IS NULL \
         DO UPDATE SET amount = $4, split_by_day = $5 \
         RETURNING id, user_id, month, category, CAST(amount AS DOUBLE PRECISION) as amount, split_by_day, deleted_at",
    )
    .bind(user_id)
    .bind(&req.month)
    .bind(&req.category)
    .bind(req.amount)
    .bind(split_by_day)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(budget))
}

pub async fn update(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
    Json(req): Json<UpdateBudget>,
) -> Result<Json<Budget>, StatusCode> {
    let existing = sqlx::query_as::<_, Budget>(
        "SELECT id, user_id, month, category, amount, split_by_day, deleted_at \
         FROM budgets WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let amount = req.amount.unwrap_or(existing.amount);
    let split_by_day = req.split_by_day.unwrap_or(existing.split_by_day);

    let budget = sqlx::query_as::<_, Budget>(
        "UPDATE budgets SET amount = $1, split_by_day = $2 WHERE id = $3 \
         RETURNING id, user_id, month, category, CAST(amount AS DOUBLE PRECISION) as amount, split_by_day, deleted_at",
    )
    .bind(amount)
    .bind(split_by_day)
    .bind(id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(budget))
}

pub async fn delete(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
) -> StatusCode {
    let result = sqlx::query(
        "UPDATE budgets SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(user_id)
    .execute(&db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT,
        _ => StatusCode::NOT_FOUND,
    }
}
