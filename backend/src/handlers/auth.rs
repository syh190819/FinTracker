use axum::{extract::State, http::StatusCode, Json};
use sqlx::PgPool;

use crate::models::user::*;

pub async fn register(
    State(db): State<PgPool>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, StatusCode> {
    if req.username.trim().is_empty() || req.password.is_empty() {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let password_hash = bcrypt::hash(&req.password, bcrypt::DEFAULT_COST)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, password_hash, created_at",
    )
    .bind(&req.username)
    .bind(&password_hash)
    .fetch_one(&db)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("duplicate key") || msg.contains("unique") {
            StatusCode::CONFLICT
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    let token = create_token(user.id, &user.username)?;
    Ok(Json(AuthResponse {
        token,
        user_id: user.id,
        username: user.username,
    }))
}

pub async fn login(
    State(db): State<PgPool>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, StatusCode> {
    let user = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, created_at FROM users WHERE username = $1",
    )
    .bind(&req.username)
    .fetch_optional(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::UNAUTHORIZED)?;

    let valid = bcrypt::verify(&req.password, &user.password_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let token = create_token(user.id, &user.username)?;
    Ok(Json(AuthResponse {
        token,
        user_id: user.id,
        username: user.username,
    }))
}

fn create_token(user_id: i32, username: &str) -> Result<String, StatusCode> {
    let secret = std::env::var("JWT_SECRET").map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let now = chrono::Utc::now();
    let exp = (now + chrono::Duration::hours(24)).timestamp() as usize;

    let claims = JwtClaims {
        sub: user_id,
        username: username.to_string(),
        exp,
    };

    let header = jsonwebtoken::Header::default();
    let key = jsonwebtoken::EncodingKey::from_secret(secret.as_bytes());

    jsonwebtoken::encode(&header, &claims, &key).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
