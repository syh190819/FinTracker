use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use sqlx::PgPool;

#[derive(Debug, Deserialize)]
pub struct UpdateUsername {
    pub new_username: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePassword {
    pub old_password: String,
    pub new_password: String,
}

pub async fn update_username(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(req): Json<UpdateUsername>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let name = req.new_username.trim().to_string();
    if name.is_empty() || name.len() > 50 {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let result = sqlx::query("UPDATE users SET username = $1 WHERE id = $2")
        .bind(&name)
        .bind(user_id)
        .execute(&db)
        .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Ok(Json(serde_json::json!({ "username": name }))),
        Ok(_) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("duplicate") || msg.contains("unique") {
                Err(StatusCode::CONFLICT)
            } else {
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }
}

pub async fn update_password(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(req): Json<UpdatePassword>,
) -> StatusCode {
    if req.new_password.is_empty() {
        return StatusCode::UNPROCESSABLE_ENTITY;
    }

    let row: Option<(String,)> =
        sqlx::query_as("SELECT password_hash FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&db)
            .await
            .ok()
            .flatten();

    let (hash,) = match row {
        Some(r) => r,
        None => return StatusCode::NOT_FOUND,
    };

    let valid = bcrypt::verify(&req.old_password, &hash).unwrap_or(false);
    if !valid {
        return StatusCode::UNAUTHORIZED;
    }

    let new_hash = match bcrypt::hash(&req.new_password, bcrypt::DEFAULT_COST) {
        Ok(h) => h,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR,
    };

    match sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&new_hash)
        .bind(user_id)
        .execute(&db)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}
