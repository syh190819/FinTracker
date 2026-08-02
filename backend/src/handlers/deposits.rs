use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use sqlx::PgPool;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct DepositPlan {
    pub id: i32,
    pub user_id: i32,
    pub name: String,
    pub category: String,
    pub monthly_goal: f64,
    pub sort_order: i32,
    pub deleted_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct DepositTransaction {
    pub id: i32,
    pub plan_id: i32,
    pub r#type: String,
    pub amount: f64,
    pub date: chrono::NaiveDate,
    pub source: String,
    pub note: String,
    pub created_by: i32,
    pub created_at: chrono::NaiveDateTime,
    pub updated_by: Option<i32>,
    pub updated_at: Option<chrono::NaiveDateTime>,
    pub deleted_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Serialize)]
pub struct PlanWithBalance {
    pub plan: DepositPlan,
    pub balance: f64,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlan {
    pub name: String,
    pub category: Option<String>,
    pub monthly_goal: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlan {
    pub name: Option<String>,
    pub category: Option<String>,
    pub monthly_goal: Option<f64>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTransaction {
    pub r#type: String,
    pub amount: f64,
    pub date: String,
    pub source: Option<String>,
    pub note: Option<String>,
}

// -- Plans --

pub async fn list_plans(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
) -> Result<Json<Vec<PlanWithBalance>>, StatusCode> {
    let plans = sqlx::query_as::<_, DepositPlan>(
        "SELECT id, user_id, name, category, CAST(monthly_goal AS DOUBLE PRECISION) as monthly_goal, \
                sort_order, deleted_at \
         FROM deposit_plans WHERE user_id = $1 AND deleted_at IS NULL ORDER BY sort_order, id",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut result = Vec::new();
    for plan in plans {
        let balance: f64 = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END), 0) AS DOUBLE PRECISION) \
             FROM deposit_transactions WHERE plan_id = $1 AND deleted_at IS NULL",
        )
        .bind(plan.id)
        .fetch_one(&db)
        .await
        .unwrap_or(0.0);

        result.push(PlanWithBalance { plan, balance });
    }

    Ok(Json(result))
}

pub async fn create_plan(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(req): Json<CreatePlan>,
) -> Result<Json<DepositPlan>, StatusCode> {
    if req.name.trim().is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let category = req.category.unwrap_or_default();
    let monthly_goal = req.monthly_goal.unwrap_or(0.0);

    let plan = sqlx::query_as::<_, DepositPlan>(
        "INSERT INTO deposit_plans (user_id, name, category, monthly_goal) \
         VALUES ($1, $2, $3, $4) \
         RETURNING id, user_id, name, category, CAST(monthly_goal AS DOUBLE PRECISION) as monthly_goal, \
                   sort_order, deleted_at",
    )
    .bind(user_id)
    .bind(&req.name)
    .bind(&category)
    .bind(monthly_goal)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(plan))
}

pub async fn update_plan(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
    Json(req): Json<UpdatePlan>,
) -> Result<Json<DepositPlan>, StatusCode> {
    let existing = sqlx::query_as::<_, DepositPlan>(
        "SELECT id, user_id, name, category, CAST(monthly_goal AS DOUBLE PRECISION) as monthly_goal, \
                sort_order, deleted_at \
         FROM deposit_plans WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let name = req.name.unwrap_or(existing.name);
    let category = req.category.unwrap_or(existing.category);
    let monthly_goal = req.monthly_goal.unwrap_or(existing.monthly_goal);
    let sort_order = req.sort_order.unwrap_or(existing.sort_order);

    let plan = sqlx::query_as::<_, DepositPlan>(
        "UPDATE deposit_plans SET name = $1, category = $2, monthly_goal = $3, sort_order = $4 \
         WHERE id = $5 \
         RETURNING id, user_id, name, category, CAST(monthly_goal AS DOUBLE PRECISION) as monthly_goal, \
                   sort_order, deleted_at",
    )
    .bind(&name)
    .bind(&category)
    .bind(monthly_goal)
    .bind(sort_order)
    .bind(id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(plan))
}

pub async fn delete_plan(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
) -> StatusCode {
    let result = sqlx::query(
        "UPDATE deposit_plans SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
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

// -- Transactions --

pub async fn list_transactions(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(plan_id): Path<i32>,
) -> Result<Json<Vec<DepositTransaction>>, StatusCode> {
    let txns = sqlx::query_as::<_, DepositTransaction>(
        "SELECT dt.id, dt.plan_id, dt.type, CAST(dt.amount AS DOUBLE PRECISION) as amount, \
                dt.date, dt.source, dt.note, dt.created_by, dt.created_at, \
                dt.updated_by, dt.updated_at, dt.deleted_at \
         FROM deposit_transactions dt \
         JOIN deposit_plans dp ON dp.id = dt.plan_id \
         WHERE dt.plan_id = $1 AND dp.user_id = $2 AND dt.deleted_at IS NULL AND dp.deleted_at IS NULL \
         ORDER BY dt.date DESC, dt.created_at DESC",
    )
    .bind(plan_id)
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(txns))
}

pub async fn create_transaction(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(plan_id): Path<i32>,
    Json(req): Json<CreateTransaction>,
) -> Result<Json<DepositTransaction>, StatusCode> {
    if req.r#type != "deposit" && req.r#type != "withdraw" {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    if req.amount <= 0.0 {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let date = chrono::NaiveDate::parse_from_str(&req.date, "%Y-%m-%d")
        .map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)?;

    let source = req.source.unwrap_or_default();
    let note = req.note.unwrap_or_default();

    let txn = sqlx::query_as::<_, DepositTransaction>(
        "INSERT INTO deposit_transactions (plan_id, type, amount, date, source, note, created_by) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         RETURNING id, plan_id, type, CAST(amount AS DOUBLE PRECISION) as amount, \
                   date, source, note, created_by, created_at, updated_by, updated_at, deleted_at",
    )
    .bind(plan_id)
    .bind(&req.r#type)
    .bind(req.amount)
    .bind(date)
    .bind(&source)
    .bind(&note)
    .bind(user_id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(txn))
}
