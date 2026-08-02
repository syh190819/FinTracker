use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, QueryBuilder};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Todo {
    pub id: i32,
    pub user_id: i32,
    pub title: String,
    pub due_date: Option<chrono::NaiveDate>,
    pub done: bool,
    pub plan_id: Option<i32>,
    pub plan_name: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: Option<chrono::NaiveDateTime>,
    pub deleted_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Deserialize)]
pub struct TodoQuery {
    pub done: Option<bool>,
    pub plan_id: Option<i32>,
    pub date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTodo {
    pub title: String,
    pub due_date: Option<String>,
    pub plan_id: Option<i32>,
    pub done: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTodo {
    pub title: Option<String>,
    pub due_date: Option<Option<String>>,
    pub plan_id: Option<Option<i32>>,
    pub done: Option<bool>,
}

pub(crate) const TODO_COLUMNS: &str = "t.id, t.user_id, t.title, t.due_date, t.done, t.plan_id, \
     p.name AS plan_name, t.created_at, t.updated_at, t.deleted_at";

fn parse_date(s: &str) -> Result<chrono::NaiveDate, StatusCode> {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)
}

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

pub async fn list(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<TodoQuery>,
) -> Result<Json<Vec<Todo>>, StatusCode> {
    let mut qb = QueryBuilder::new("SELECT ");
    qb.push(TODO_COLUMNS);
    qb.push(" FROM todos t LEFT JOIN plans p ON p.id = t.plan_id AND p.deleted_at IS NULL");
    qb.push(" WHERE t.user_id = ");
    qb.push_bind(user_id);
    qb.push(" AND t.deleted_at IS NULL");
    if let Some(done) = query.done {
        qb.push(" AND t.done = ").push_bind(done);
    }
    if let Some(pid) = query.plan_id {
        qb.push(" AND t.plan_id = ").push_bind(pid);
    }
    if let Some(date) = &query.date {
        let parsed = parse_date(date)?;
        qb.push(" AND t.due_date = ").push_bind(parsed);
    }
    qb.push(" ORDER BY t.done ASC, t.due_date ASC NULLS LAST, t.created_at DESC LIMIT 1000");

    let rows = qb
        .build_query_as::<Todo>()
        .fetch_all(&db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows))
}

pub async fn create(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(req): Json<CreateTodo>,
) -> Result<Json<Todo>, StatusCode> {
    let title = req.title.trim().to_string();
    if title.is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let due_date = match &req.due_date {
        Some(d) => Some(parse_date(d)?),
        None => None,
    };
    if let Some(pid) = req.plan_id {
        if !plan_belongs_to(&db, user_id, pid).await? {
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
    }
    let done = req.done.unwrap_or(false);

    let todo = sqlx::query_as::<_, Todo>(
        "INSERT INTO todos (user_id, title, due_date, plan_id, done) VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, user_id, title, due_date, done, plan_id, NULL AS plan_name, created_at, updated_at, deleted_at",
    )
    .bind(user_id)
    .bind(&title)
    .bind(due_date)
    .bind(req.plan_id)
    .bind(done)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(todo))
}

pub async fn update(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
    Json(req): Json<UpdateTodo>,
) -> Result<Json<Todo>, StatusCode> {
    let existing = sqlx::query_as::<_, Todo>(&format!(
        "SELECT {} FROM todos t LEFT JOIN plans p ON p.id = t.plan_id AND p.deleted_at IS NULL \
         WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NULL",
        TODO_COLUMNS
    ))
    .bind(id)
    .bind(user_id)
    .fetch_optional(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let title = req.title.unwrap_or(existing.title);
    if title.trim().is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let due_date = match req.due_date {
        Some(Some(d)) => Some(parse_date(&d)?),
        Some(None) => None,
        None => existing.due_date,
    };
    let plan_id = match req.plan_id {
        Some(Some(pid)) => {
            if !plan_belongs_to(&db, user_id, pid).await? {
                return Err(StatusCode::UNPROCESSABLE_ENTITY);
            }
            Some(pid)
        }
        Some(None) => None,
        None => existing.plan_id,
    };
    let done = req.done.unwrap_or(existing.done);

    let todo = sqlx::query_as::<_, Todo>(
        "UPDATE todos SET title = $1, due_date = $2, plan_id = $3, done = $4, updated_at = NOW() \
         WHERE id = $5 \
         RETURNING id, user_id, title, due_date, done, plan_id, NULL AS plan_name, created_at, updated_at, deleted_at",
    )
    .bind(&title)
    .bind(due_date)
    .bind(plan_id)
    .bind(done)
    .bind(id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(todo))
}

pub async fn delete(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
) -> StatusCode {
    let result = sqlx::query(
        "UPDATE todos SET deleted_at = NOW(), updated_at = NOW() \
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
