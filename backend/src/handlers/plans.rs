use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, QueryBuilder};

pub const PLAN_TYPES: [&str; 3] = ["budget", "deposit", "todo"];

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Plan {
    pub id: i32,
    pub user_id: i32,
    pub name: String,
    pub deadline: Option<chrono::NaiveDate>,
    pub plan_types: Vec<String>,
    pub income_goal: f64,
    pub expense_limit: f64,
    pub monthly_goal: f64,
    pub auto_todo_enabled: bool,
    pub auto_todo_day: i32,
    pub progress: i32,
    pub done_count: i64,
    pub total_count: i64,
    pub expense_total: f64,
    pub income_total: f64,
    pub balance: f64,
    pub archived: bool,
    pub archived_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: Option<chrono::NaiveDateTime>,
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

#[derive(Debug, Deserialize)]
pub struct PlanQuery {
    pub archived: Option<bool>,
    pub r#type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlan {
    pub name: String,
    pub deadline: Option<String>,
    pub plan_types: Vec<String>,
    pub income_goal: Option<f64>,
    pub expense_limit: Option<f64>,
    pub monthly_goal: Option<f64>,
    pub auto_todo_enabled: Option<bool>,
    pub auto_todo_day: Option<i32>,
    pub progress: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlan {
    pub name: Option<String>,
    pub deadline: Option<Option<String>>,
    pub plan_types: Option<Vec<String>>,
    pub income_goal: Option<f64>,
    pub expense_limit: Option<f64>,
    pub monthly_goal: Option<f64>,
    pub auto_todo_enabled: Option<bool>,
    pub auto_todo_day: Option<i32>,
    pub progress: Option<i32>,
    pub archived: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTransaction {
    pub r#type: String,
    pub amount: f64,
    pub date: String,
    pub source: Option<String>,
    pub note: Option<String>,
}

pub(crate) const PLAN_SELECT_COLUMNS: &str = "p.id, p.user_id, p.name, p.deadline, p.plan_types, \
     CAST(p.income_goal AS DOUBLE PRECISION) AS income_goal, \
     CAST(p.expense_limit AS DOUBLE PRECISION) AS expense_limit, \
     CAST(p.monthly_goal AS DOUBLE PRECISION) AS monthly_goal, \
     p.auto_todo_enabled, p.auto_todo_day, \
     CASE WHEN COUNT(ad.id) > 0 \
          THEN ROUND(100.0 * COUNT(ad.id) FILTER (WHERE ad.done) / COUNT(ad.id))::int \
          ELSE p.progress END AS progress, \
     COUNT(ad.id) FILTER (WHERE ad.done) AS done_count, \
     COUNT(ad.id) AS total_count, \
     (SELECT CAST(COALESCE(SUM(e.amount), 0) AS DOUBLE PRECISION) FROM expenses e \
      WHERE e.plan_id = p.id AND e.deleted_at IS NULL AND e.type = 'expense') AS expense_total, \
     (SELECT CAST(COALESCE(SUM(e.amount), 0) AS DOUBLE PRECISION) FROM expenses e \
      WHERE e.plan_id = p.id AND e.deleted_at IS NULL AND e.type = 'income') AS income_total, \
     (SELECT CAST(COALESCE(SUM(CASE WHEN dt.type = 'deposit' THEN dt.amount ELSE -dt.amount END), 0) AS DOUBLE PRECISION) \
      FROM deposit_transactions dt WHERE dt.plan_id = p.id AND dt.deleted_at IS NULL) AS balance, \
     p.archived, p.archived_at, p.created_at, p.updated_at, p.deleted_at";

fn parse_date(s: &str) -> Result<chrono::NaiveDate, StatusCode> {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)
}

fn validate_plan_types(types: &[String]) -> Result<(), StatusCode> {
    if types.is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    if types.iter().any(|t| !PLAN_TYPES.contains(&t.as_str())) {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    Ok(())
}

async fn fetch_plan(db: &PgPool, id: i32, user_id: i32) -> Result<Plan, StatusCode> {
    let sql = format!(
        "WITH RECURSIVE all_todos AS ( \
            SELECT id, plan_id, done FROM todos \
            WHERE user_id = $2 AND deleted_at IS NULL AND plan_id IS NOT NULL \
            UNION \
            SELECT t.id, a.plan_id, t.done \
            FROM todos t JOIN all_todos a ON t.parent_id = a.id \
            WHERE t.user_id = $2 AND t.deleted_at IS NULL \
         ) SELECT {} FROM plans p LEFT JOIN all_todos ad ON ad.plan_id = p.id \
         WHERE p.id = $1 AND p.user_id = $2 AND p.deleted_at IS NULL GROUP BY p.id",
        PLAN_SELECT_COLUMNS
    );
    sqlx::query_as::<_, Plan>(&sql)
        .bind(id)
        .bind(user_id)
        .fetch_optional(db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn list(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<PlanQuery>,
) -> Result<Json<Vec<Plan>>, StatusCode> {
    let mut qb = QueryBuilder::new(
        "WITH RECURSIVE all_todos AS ( \
            SELECT id, plan_id, done FROM todos \
            WHERE user_id = ",
    );
    qb.push_bind(user_id);
    qb.push(" AND deleted_at IS NULL AND plan_id IS NOT NULL \
            UNION \
            SELECT t.id, a.plan_id, t.done \
            FROM todos t JOIN all_todos a ON t.parent_id = a.id \
            WHERE t.user_id = ");
    qb.push_bind(user_id);
    qb.push(" AND t.deleted_at IS NULL \
            ) SELECT ");
    qb.push(PLAN_SELECT_COLUMNS);
    qb.push(" FROM plans p LEFT JOIN all_todos ad ON ad.plan_id = p.id WHERE p.user_id = ");
    qb.push_bind(user_id);
    qb.push(" AND p.deleted_at IS NULL");
    if let Some(archived) = query.archived {
        qb.push(" AND p.archived = ").push_bind(archived);
    }
    if let Some(t) = &query.r#type {
        if !PLAN_TYPES.contains(&t.as_str()) {
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
        qb.push(" AND p.plan_types @> ARRAY[").push_bind(t.as_str()).push("]");
    }
    qb.push(
        " GROUP BY p.id ORDER BY p.archived ASC, p.deadline ASC NULLS LAST, p.created_at DESC LIMIT 1000",
    );

    let rows = qb
        .build_query_as::<Plan>()
        .fetch_all(&db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows))
}

pub async fn create(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(req): Json<CreatePlan>,
) -> Result<Json<Plan>, StatusCode> {
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    validate_plan_types(&req.plan_types)?;
    let deadline = match &req.deadline {
        Some(d) => Some(parse_date(d)?),
        None => None,
    };
    let progress = req.progress.unwrap_or(0);
    if !(0..=100).contains(&progress) {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let auto_todo_day = req.auto_todo_day.unwrap_or(28);
    if !(1..=28).contains(&auto_todo_day) {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let plan = sqlx::query_as::<_, Plan>(
        "INSERT INTO plans (user_id, name, deadline, plan_types, income_goal, expense_limit, \
                monthly_goal, auto_todo_enabled, auto_todo_day, progress) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) \
         RETURNING id, user_id, name, deadline, plan_types, \
                   CAST(income_goal AS DOUBLE PRECISION), CAST(expense_limit AS DOUBLE PRECISION), \
                   CAST(monthly_goal AS DOUBLE PRECISION), auto_todo_enabled, auto_todo_day, \
                   progress, 0::BIGINT AS done_count, 0::BIGINT AS total_count, \
                   0::DOUBLE PRECISION AS expense_total, 0::DOUBLE PRECISION AS income_total, \
                   0::DOUBLE PRECISION AS balance, \
                   archived, archived_at, created_at, updated_at, deleted_at",
    )
    .bind(user_id)
    .bind(&name)
    .bind(deadline)
    .bind(&req.plan_types)
    .bind(req.income_goal.unwrap_or(0.0))
    .bind(req.expense_limit.unwrap_or(0.0))
    .bind(req.monthly_goal.unwrap_or(0.0))
    .bind(req.auto_todo_enabled.unwrap_or(false))
    .bind(auto_todo_day)
    .bind(progress)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(plan))
}

pub async fn update(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
    Json(req): Json<UpdatePlan>,
) -> Result<Json<Plan>, StatusCode> {
    let existing = fetch_plan(&db, id, user_id).await?;

    let name = req.name.unwrap_or(existing.name);
    if name.trim().is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let plan_types = req.plan_types.unwrap_or(existing.plan_types);
    validate_plan_types(&plan_types)?;
    let deadline = match req.deadline {
        Some(Some(d)) => Some(parse_date(&d)?),
        Some(None) => None,
        None => existing.deadline,
    };
    let progress = req.progress.unwrap_or(existing.progress);
    if !(0..=100).contains(&progress) {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let auto_todo_day = req.auto_todo_day.unwrap_or(existing.auto_todo_day);
    if !(1..=28).contains(&auto_todo_day) {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let archived = req.archived.unwrap_or(existing.archived);

    let result = sqlx::query(
        "UPDATE plans SET name = $1, deadline = $2, plan_types = $3, \
                income_goal = $4, expense_limit = $5, monthly_goal = $6, \
                auto_todo_enabled = $7, auto_todo_day = $8, progress = $9, archived = $10, \
                archived_at = CASE WHEN $10 AND archived_at IS NULL THEN NOW() \
                                   WHEN NOT $10 THEN NULL ELSE archived_at END, \
                updated_at = NOW() \
         WHERE id = $11 AND user_id = $12 AND deleted_at IS NULL",
    )
    .bind(&name)
    .bind(deadline)
    .bind(&plan_types)
    .bind(req.income_goal.unwrap_or(existing.income_goal))
    .bind(req.expense_limit.unwrap_or(existing.expense_limit))
    .bind(req.monthly_goal.unwrap_or(existing.monthly_goal))
    .bind(req.auto_todo_enabled.unwrap_or(existing.auto_todo_enabled))
    .bind(auto_todo_day)
    .bind(progress)
    .bind(archived)
    .bind(id)
    .bind(user_id)
    .execute(&db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {}
        _ => return Err(StatusCode::NOT_FOUND),
    }

    let plan = fetch_plan(&db, id, user_id).await?;
    Ok(Json(plan))
}

pub async fn delete(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
) -> StatusCode {
    let result = sqlx::query(
        "UPDATE plans SET deleted_at = NOW(), updated_at = NOW() \
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
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

// ── 存取流水（并入计划） ──

async fn plan_belongs_to(db: &PgPool, user_id: i32, plan_id: i32) -> Result<bool, StatusCode> {
    let row: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM plans WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(plan_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(row.is_some())
}

pub async fn list_transactions(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(plan_id): Path<i32>,
) -> Result<Json<Vec<DepositTransaction>>, StatusCode> {
    if !plan_belongs_to(&db, user_id, plan_id).await? {
        return Err(StatusCode::NOT_FOUND);
    }
    let rows = sqlx::query_as::<_, DepositTransaction>(
        "SELECT id, plan_id, type, CAST(amount AS DOUBLE PRECISION) AS amount, date, source, note, \
                created_by, created_at, updated_by, updated_at, deleted_at \
         FROM deposit_transactions WHERE plan_id = $1 AND deleted_at IS NULL \
         ORDER BY date DESC, id DESC LIMIT 500",
    )
    .bind(plan_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows))
}

pub async fn create_transaction(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(plan_id): Path<i32>,
    Json(req): Json<CreateTransaction>,
) -> Result<Json<DepositTransaction>, StatusCode> {
    if !plan_belongs_to(&db, user_id, plan_id).await? {
        return Err(StatusCode::NOT_FOUND);
    }
    if req.r#type != "deposit" && req.r#type != "withdraw" {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    if req.amount <= 0.0 {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let date = parse_date(&req.date)?;
    let source = req.source.unwrap_or_default();
    let note = req.note.unwrap_or_default();

    let txn = sqlx::query_as::<_, DepositTransaction>(
        "INSERT INTO deposit_transactions (plan_id, type, amount, date, source, note, created_by) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         RETURNING id, plan_id, type, CAST(amount AS DOUBLE PRECISION) AS amount, date, source, note, \
                   created_by, created_at, updated_by, updated_at, deleted_at",
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
