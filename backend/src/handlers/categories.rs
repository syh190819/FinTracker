use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use sqlx::PgPool;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Category {
    pub id: i32,
    pub user_id: i32,
    pub name: String,
    #[serde(default)]
    pub excluded: bool,
    pub sort_order: i32,
    pub deleted_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategory {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategory {
    pub name: Option<String>,
    pub excluded: Option<bool>,
    pub sort_order: Option<i32>,
}

pub async fn list(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
) -> Result<Json<Vec<Category>>, StatusCode> {
    let categories = sqlx::query_as::<_, Category>(
        "SELECT id, user_id, name, excluded, sort_order, deleted_at FROM categories WHERE user_id = $1 AND deleted_at IS NULL ORDER BY sort_order, id",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(categories))
}

pub async fn create(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(req): Json<CreateCategory>,
) -> Result<Json<Category>, StatusCode> {
    let name = req.name.trim().to_string();
    if name.is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let category = sqlx::query_as::<_, Category>(
        "INSERT INTO categories (user_id, name) VALUES ($1, $2) RETURNING id, user_id, name, excluded, sort_order, deleted_at",
    )
    .bind(user_id)
    .bind(&name)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::CONFLICT)?;

    Ok(Json(category))
}

pub async fn update(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
    Json(req): Json<UpdateCategory>,
) -> Result<Json<Category>, StatusCode> {
    let existing = sqlx::query_as::<_, Category>(
        "SELECT id, user_id, name, excluded, sort_order, deleted_at FROM categories WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let name = req.name.unwrap_or(existing.name);
    let excluded = req.excluded.unwrap_or(existing.excluded);
    let sort_order = req.sort_order.unwrap_or(existing.sort_order);

    let category = sqlx::query_as::<_, Category>(
        "UPDATE categories SET name = $1, excluded = $2, sort_order = $3 WHERE id = $4 RETURNING id, user_id, name, excluded, sort_order, deleted_at",
    )
    .bind(&name)
    .bind(excluded)
    .bind(sort_order)
    .bind(id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(category))
}

pub async fn delete(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
) -> StatusCode {
    let result = sqlx::query(
        "UPDATE categories SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
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
