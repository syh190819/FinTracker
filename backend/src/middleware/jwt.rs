use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use crate::models::user::JwtClaims;

pub async fn auth_middleware(mut req: Request, next: Next) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let secret = std::env::var("JWT_SECRET")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let decoding_key = jsonwebtoken::DecodingKey::from_secret(secret.as_bytes());
    let validation = jsonwebtoken::Validation::default();

    let token_data = jsonwebtoken::decode::<JwtClaims>(token, &decoding_key, &validation)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let claims = token_data.claims;

    req.extensions_mut().insert(claims.sub);
    req.extensions_mut().insert(claims.username.clone());

    Ok(next.run(req).await)
}
