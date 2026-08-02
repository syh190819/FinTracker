use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use sqlx::PgPool;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Expense {
    pub id: i32,
    pub user_id: i32,
    pub amount: f64,
    pub category: String,
    pub date: chrono::NaiveDate,
    pub note: String,
    pub created_by: i32,
    pub created_at: chrono::NaiveDateTime,
    pub updated_by: Option<i32>,
    pub updated_at: Option<chrono::NaiveDateTime>,
    pub deleted_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Deserialize)]
pub struct ExpenseQuery {
    pub date: Option<String>,
    pub month: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateExpense {
    pub amount: f64,
    pub category: String,
    pub date: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateExpense {
    pub amount: Option<f64>,
    pub category: Option<String>,
    pub date: Option<String>,
    pub note: Option<String>,
}

pub async fn list(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<ExpenseQuery>,
) -> Result<Json<Vec<Expense>>, StatusCode> {
    let mut sql = String::from(
        "SELECT id, user_id, CAST(amount AS DOUBLE PRECISION) as amount, category, date, note, created_by, created_at, updated_by, updated_at, deleted_at \
         FROM expenses WHERE deleted_at IS NULL AND (user_id = $1",
    );

    // 查共享伙伴的支出
    let shared_users = get_shared_user_ids(&db, user_id).await;
    if !shared_users.is_empty() {
        for uid in &shared_users {
            sql.push_str(&format!(" OR user_id = {}", uid));
        }
    }
    sql.push(')');

    if let Some(ref date) = query.date {
        sql.push_str(&format!(" AND date = '{}'", date));
    }
    if let Some(ref month) = query.month {
        sql.push_str(&format!(" AND to_char(date, 'YYYY-MM') = '{}'", month));
    }
    if let Some(ref category) = query.category {
        sql.push_str(&format!(" AND category = '{}'", category));
    }

    sql.push_str(" ORDER BY date DESC, created_at DESC");
    sql.push_str(" LIMIT 1000");

    // Simple query with raw SQL since dynamic SQL building is tricky with sqlx
    let rows = sqlx::query_as::<_, Expense>(&sql)
        .bind(user_id)
        .fetch_all(&db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(rows))
}

pub async fn create(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(req): Json<CreateExpense>,
) -> Result<Json<Expense>, StatusCode> {
    if req.amount <= 0.0 || req.category.trim().is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let date = chrono::NaiveDate::parse_from_str(&req.date, "%Y-%m-%d")
        .map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)?;

    let note = req.note.unwrap_or_default();

    let expense = sqlx::query_as::<_, Expense>(
        "INSERT INTO expenses (user_id, amount, category, date, note, created_by) \
         VALUES ($1, $2, $3, $4, $5, $6) \
         RETURNING id, user_id, CAST(amount AS DOUBLE PRECISION) as amount, category, date, note, \
                   created_by, created_at, updated_by, updated_at, deleted_at",
    )
    .bind(user_id)
    .bind(req.amount)
    .bind(&req.category)
    .bind(date)
    .bind(&note)
    .bind(user_id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(expense))
}

pub async fn update(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
    Json(req): Json<UpdateExpense>,
) -> Result<Json<Expense>, StatusCode> {
    let existing = sqlx::query_as::<_, Expense>(
        "SELECT id, user_id, CAST(amount AS DOUBLE PRECISION) as amount, category, date, note, \
                created_by, created_at, updated_by, updated_at, deleted_at \
         FROM expenses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let amount = req.amount.unwrap_or(existing.amount);
    let category = req.category.unwrap_or(existing.category);
    let date = if let Some(ref d) = req.date {
        chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
            .map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)?
    } else {
        existing.date
    };
    let note = req.note.unwrap_or(existing.note);

    let expense = sqlx::query_as::<_, Expense>(
        "UPDATE expenses SET amount = $1, category = $2, date = $3, note = $4, updated_by = $5, updated_at = NOW() \
         WHERE id = $6 \
         RETURNING id, user_id, CAST(amount AS DOUBLE PRECISION) as amount, category, date, note, \
                   created_by, created_at, updated_by, updated_at, deleted_at",
    )
    .bind(amount)
    .bind(&category)
    .bind(date)
    .bind(&note)
    .bind(user_id)
    .bind(id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(expense))
}

pub async fn delete(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
) -> StatusCode {
    let result = sqlx::query(
        "UPDATE expenses SET deleted_at = NOW(), updated_by = $1 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL",
    )
    .bind(user_id)
    .bind(id)
    .bind(user_id)
    .execute(&db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT,
        _ => StatusCode::NOT_FOUND,
    }
}

async fn get_shared_user_ids(db: &PgPool, user_id: i32) -> Vec<i32> {
    let shared = sqlx::query_as::<sqlx::Postgres, (i32,)>(
        "SELECT CASE WHEN user_a_id = $1 THEN user_b_id ELSE user_a_id END \
         FROM sharing \
         WHERE (user_a_id = $1 OR user_b_id = $1) \
         AND status = 'active' AND confirmed_by_b = true",
    )
    .bind(user_id)
    .fetch_all(db)
    .await;

    match shared {
        Ok(rows) => rows.into_iter().map(|r| r.0).collect(),
        Err(_) => vec![],
    }
}
