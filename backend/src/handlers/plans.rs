use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, QueryBuilder};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Plan {
    pub id: i32,
    pub user_id: i32,
    pub name: String,
    pub deadline: Option<chrono::NaiveDate>,
    pub progress: i32,
    pub done_count: i64,
    pub total_count: i64,
    pub expense_total: f64,
    pub archived: bool,
    pub archived_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: Option<chrono::NaiveDateTime>,
    pub deleted_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Deserialize)]
pub struct PlanQuery {
    pub archived: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlan {
    pub name: String,
    pub deadline: Option<String>,
    pub progress: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlan {
    pub name: Option<String>,
    pub deadline: Option<Option<String>>,
    pub progress: Option<i32>,
    pub archived: Option<bool>,
}

pub(crate) const PLAN_SELECT_COLUMNS: &str = "p.id, p.user_id, p.name, p.deadline, \
     CASE WHEN COUNT(ad.id) > 0 \
          THEN ROUND(100.0 * COUNT(ad.id) FILTER (WHERE ad.done) / COUNT(ad.id))::int \
          ELSE p.progress END AS progress, \
     COUNT(ad.id) FILTER (WHERE ad.done) AS done_count, \
     COUNT(ad.id) AS total_count, \
     (SELECT CAST(COALESCE(SUM(e.amount), 0) AS DOUBLE PRECISION) FROM expenses e \
      WHERE e.plan_id = p.id AND e.deleted_at IS NULL) AS expense_total, \
     p.archived, p.archived_at, p.created_at, p.updated_at, p.deleted_at";

fn plan_cte() -> &'static str {
    "WITH RECURSIVE all_todos AS ( \
        SELECT id, plan_id, done FROM todos \
        WHERE user_id = {u} AND deleted_at IS NULL AND plan_id IS NOT NULL \
        UNION \
        SELECT t.id, a.plan_id, t.done \
        FROM todos t JOIN all_todos a ON t.parent_id = a.id \
        WHERE t.user_id = {u} AND t.deleted_at IS NULL \
     )"
}

fn parse_date(s: &str) -> Result<chrono::NaiveDate, StatusCode> {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)
}

async fn fetch_plan(db: &PgPool, id: i32, user_id: i32) -> Result<Plan, StatusCode> {
    let sql = format!(
        "{} SELECT {} FROM plans p LEFT JOIN all_todos ad ON ad.plan_id = p.id \
         WHERE p.id = $1 AND p.user_id = $2 AND p.deleted_at IS NULL GROUP BY p.id",
        plan_cte().replace("{u}", "$2"),
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
    let deadline = match &req.deadline {
        Some(d) => Some(parse_date(d)?),
        None => None,
    };
    let progress = req.progress.unwrap_or(0);
    if !(0..=100).contains(&progress) {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let plan = sqlx::query_as::<_, Plan>(
        "INSERT INTO plans (user_id, name, deadline, progress) VALUES ($1, $2, $3, $4) \
         RETURNING id, user_id, name, deadline, progress, 0::BIGINT AS done_count, 0::BIGINT AS total_count, \
                   0::DOUBLE PRECISION AS expense_total, \
                   archived, archived_at, created_at, updated_at, deleted_at",
    )
    .bind(user_id)
    .bind(&name)
    .bind(deadline)
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
    let deadline = match req.deadline {
        Some(Some(d)) => Some(parse_date(&d)?),
        Some(None) => None,
        None => existing.deadline,
    };
    let progress = req.progress.unwrap_or(existing.progress);
    if !(0..=100).contains(&progress) {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let archived = req.archived.unwrap_or(existing.archived);

    let result = sqlx::query(
        "UPDATE plans SET name = $1, deadline = $2, progress = $3, archived = $4, \
                archived_at = CASE WHEN $4 AND archived_at IS NULL THEN NOW() \
                                   WHEN NOT $4 THEN NULL ELSE archived_at END, \
                updated_at = NOW() \
         WHERE id = $5 AND user_id = $6 AND deleted_at IS NULL",
    )
    .bind(&name)
    .bind(deadline)
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
