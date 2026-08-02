use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use sqlx::PgPool;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Sharing {
    pub id: i32,
    pub user_a_id: i32,
    pub user_b_id: i32,
    pub status: String,
    pub invite_code: String,
    pub confirmed_by_b: bool,
    pub scope: serde_json::Value,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct SharingWithUsername {
    pub id: i32,
    pub partner_id: i32,
    pub partner_name: String,
    pub status: String,
    pub invite_code: String,
    pub confirmed_by_b: bool,
    pub scope: serde_json::Value,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct InviteRequest {
    pub invite_code: String,
}

#[derive(Debug, Deserialize)]
pub struct ScopeUpdate {
    pub scope: serde_json::Value,
}

pub async fn invite(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    use rand::Rng;
    let invite_code: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(8)
        .map(char::from)
        .collect::<String>()
        .to_uppercase();

    let _ = sqlx::query(
        "UPDATE sharing SET status = 'revoked' WHERE user_a_id = $1 AND status = 'active' AND confirmed_by_b = false",
    )
    .bind(user_id)
    .execute(&db)
    .await;

    let sharing = sqlx::query_as::<_, Sharing>(
        "INSERT INTO sharing (user_a_id, user_b_id, invite_code) \
         VALUES ($1, $1, $2) \
         ON CONFLICT (user_a_id, user_b_id) DO UPDATE \
         SET invite_code = $2, status = 'active', confirmed_by_b = false \
         RETURNING id, user_a_id, user_b_id, status, invite_code, confirmed_by_b, scope, created_at",
    )
    .bind(user_id)
    .bind(&invite_code)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({
        "invite_code": sharing.invite_code,
        "id": sharing.id,
    })))
}

pub async fn accept(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(req): Json<InviteRequest>,
) -> Result<Json<Sharing>, StatusCode> {
    let code = req.invite_code.trim().to_uppercase();

    let invite = sqlx::query_as::<_, Sharing>(
        "SELECT id, user_a_id, user_b_id, status, invite_code, confirmed_by_b, scope, created_at \
         FROM sharing WHERE invite_code = $1 AND status = 'active' AND confirmed_by_b = false",
    )
    .bind(&code)
    .fetch_optional(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    if invite.user_a_id == user_id {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let sharing = sqlx::query_as::<_, Sharing>(
        "UPDATE sharing SET user_b_id = $1, confirmed_by_b = true \
         WHERE id = $2 \
         RETURNING id, user_a_id, user_b_id, status, invite_code, confirmed_by_b, scope, created_at",
    )
    .bind(user_id)
    .bind(invite.id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(sharing))
}

pub async fn relationships(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
) -> Result<Json<Vec<SharingWithUsername>>, StatusCode> {
    let rows = sqlx::query_as::<sqlx::Postgres, (i32, i32, i32, String, String, bool, serde_json::Value, chrono::NaiveDateTime, String)>(
        "SELECT s.id,
                CASE WHEN s.user_a_id = $1 THEN s.user_b_id ELSE s.user_a_id END as partner_id,
                s.user_a_id, s.status, s.invite_code, s.confirmed_by_b, s.scope, s.created_at,
                u.username
         FROM sharing s \
         JOIN users u ON u.id = CASE WHEN s.user_a_id = $1 THEN s.user_b_id ELSE s.user_a_id END \
         WHERE (s.user_a_id = $1 OR s.user_b_id = $1) AND s.status = 'active' AND s.confirmed_by_b = true",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result = rows
        .into_iter()
        .map(|(id, partner_id, _, status, code, confirmed, scope, created_at, username)| {
            SharingWithUsername {
                id,
                partner_id,
                partner_name: username,
                status,
                invite_code: code,
                confirmed_by_b: confirmed,
                scope,
                created_at,
            }
        })
        .collect();

    Ok(Json(result))
}

pub async fn update_scope(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
    Json(req): Json<ScopeUpdate>,
) -> Result<Json<Sharing>, StatusCode> {
    let sharing = sqlx::query_as::<_, Sharing>(
        "UPDATE sharing SET scope = $1 WHERE id = $2 AND (user_a_id = $3 OR user_b_id = $3) \
         RETURNING id, user_a_id, user_b_id, status, invite_code, confirmed_by_b, scope, created_at",
    )
    .bind(&req.scope)
    .bind(id)
    .bind(user_id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(sharing))
}

pub async fn delete(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
) -> StatusCode {
    let result = sqlx::query(
        "UPDATE sharing SET status = 'revoked' WHERE id = $1 AND (user_a_id = $2 OR user_b_id = $2)",
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
