use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use sqlx::PgPool;

#[derive(Debug, Deserialize)]
pub struct MonthlyQuery {
    pub year: Option<i32>,
    pub month: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MonthlyTotal {
    pub month: String,
    pub total: f64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CategoryTotal {
    pub category: String,
    pub total: f64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct BudgetVsActual {
    pub category: String,
    pub budget: f64,
    pub actual: f64,
}

pub async fn monthly(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<MonthlyQuery>,
) -> Result<Json<Vec<MonthlyTotal>>, StatusCode> {
    let year = query.year.unwrap_or_else(|| {
        chrono::Local::now()
            .format("%Y")
            .to_string()
            .parse()
            .unwrap_or(2026)
    });

    let shared_ids = get_shared_ids(&db, user_id).await;

    let mut sql = String::from(
        "SELECT to_char(date, 'YYYY-MM') as month, \
                CAST(COALESCE(SUM(amount), 0) AS DOUBLE PRECISION) as total \
         FROM expenses WHERE deleted_at IS NULL AND EXTRACT(YEAR FROM date) = $1 AND (user_id = $2",
    );
    for uid in &shared_ids {
        sql.push_str(&format!(" OR user_id = {}", uid));
    }
    sql.push_str(") GROUP BY to_char(date, 'YYYY-MM') ORDER BY month");

    let rows = sqlx::query_as::<sqlx::Postgres, MonthlyTotal>(&sql)
        .bind(year)
        .bind(user_id)
        .fetch_all(&db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(rows))
}

pub async fn category(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<MonthlyQuery>,
) -> Result<Json<Vec<CategoryTotal>>, StatusCode> {
    let month = query.month.unwrap_or_else(|| {
        chrono::Local::now().format("%Y-%m").to_string()
    });

    let shared_ids = get_shared_ids(&db, user_id).await;

    let mut sql = String::from(
        "SELECT category, CAST(COALESCE(SUM(amount), 0) AS DOUBLE PRECISION) as total \
         FROM expenses WHERE deleted_at IS NULL AND to_char(date, 'YYYY-MM') = $1 AND (user_id = $2",
    );
    for uid in &shared_ids {
        sql.push_str(&format!(" OR user_id = {}", uid));
    }
    sql.push_str(") GROUP BY category ORDER BY total DESC");

    let rows = sqlx::query_as::<sqlx::Postgres, CategoryTotal>(&sql)
        .bind(&month)
        .bind(user_id)
        .fetch_all(&db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(rows))
}

pub async fn budget_vs_actual(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<MonthlyQuery>,
) -> Result<Json<Vec<BudgetVsActual>>, StatusCode> {
    let month = query.month.unwrap_or_else(|| {
        chrono::Local::now().format("%Y-%m").to_string()
    });

    let rows = sqlx::query_as::<sqlx::Postgres, BudgetVsActual>(
        "SELECT b.category, CAST(b.amount AS DOUBLE PRECISION) as budget, \
                CAST(COALESCE(SUM(e.amount), 0) AS DOUBLE PRECISION) as actual \
         FROM budgets b \
         LEFT JOIN expenses e ON e.category = b.category AND e.user_id = b.user_id \
            AND to_char(e.date, 'YYYY-MM') = b.month AND e.deleted_at IS NULL \
         WHERE b.user_id = $1 AND b.month = $2 AND b.deleted_at IS NULL \
         GROUP BY b.category, b.amount \
         ORDER BY b.category",
    )
    .bind(user_id)
    .bind(&month)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(rows))
}

async fn get_shared_ids(db: &PgPool, user_id: i32) -> Vec<i32> {
    let rows = sqlx::query_as::<sqlx::Postgres, (i32,)>(
        "SELECT CASE WHEN user_a_id = $1 THEN user_b_id ELSE user_a_id END \
         FROM sharing WHERE (user_a_id = $1 OR user_b_id = $1) \
         AND status = 'active' AND confirmed_by_b = true",
    )
    .bind(user_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    rows.into_iter().map(|r| r.0).collect()
}
