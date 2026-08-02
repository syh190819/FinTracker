use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use sqlx::PgPool;

#[derive(Debug, Serialize)]
pub struct ExportData {
    pub categories: Vec<serde_json::Value>,
    pub expenses: Vec<serde_json::Value>,
    pub budgets: Vec<serde_json::Value>,
    pub deposit_plans: Vec<serde_json::Value>,
    pub deposit_transactions: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct ImportData {
    pub categories: Option<Vec<serde_json::Value>>,
    pub expenses: Option<Vec<serde_json::Value>>,
    pub budgets: Option<Vec<serde_json::Value>>,
    pub deposit_plans: Option<Vec<serde_json::Value>>,
    pub deposit_transactions: Option<Vec<serde_json::Value>>,
}

pub async fn export_all(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
) -> Result<Json<ExportData>, StatusCode> {
    let categories: Vec<serde_json::Value> = sqlx::query(
        "SELECT row_to_json(t) FROM (SELECT name, excluded, sort_order FROM categories WHERE user_id = $1 AND deleted_at IS NULL ORDER BY sort_order) t",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .into_iter()
    .filter_map(|r| {
        let v: serde_json::Value = r.get(0);
        Some(v)
    })
    .collect();

    let expenses: Vec<serde_json::Value> = sqlx::query_as::<sqlx::Postgres, (String, f64, String, String, String)>(
        "SELECT category, CAST(amount AS DOUBLE PRECISION), to_char(date, 'YYYY-MM-DD'), COALESCE(note, ''), type \
         FROM expenses WHERE user_id = $1 AND deleted_at IS NULL ORDER BY date",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .into_iter()
    .map(|(category, amount, date, note, ty)| {
        serde_json::json!({"category": category, "amount": amount, "date": date, "note": note, "type": ty})
    })
    .collect();

    let budgets: Vec<serde_json::Value> = sqlx::query_as::<sqlx::Postgres, (String, String, f64, bool)>(
        "SELECT month, category, CAST(amount AS DOUBLE PRECISION), split_by_day \
         FROM budgets WHERE user_id = $1 AND deleted_at IS NULL ORDER BY month",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .into_iter()
    .map(|(month, category, amount, split)| {
        serde_json::json!({"month": month, "category": category, "amount": amount, "split_by_day": split})
    })
    .collect();

    let deposit_plans: Vec<serde_json::Value> = sqlx::query_as::<sqlx::Postgres, (String, String, f64)>(
        "SELECT name, '' AS category, CAST(monthly_goal AS DOUBLE PRECISION) \
         FROM plans WHERE user_id = $1 AND deleted_at IS NULL AND plan_types @> ARRAY['deposit'] ORDER BY id",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .into_iter()
    .map(|(name, category, goal)| {
        serde_json::json!({"name": name, "category": category, "monthly_goal": goal})
    })
    .collect();

    let deposit_transactions: Vec<serde_json::Value> = sqlx::query_as::<sqlx::Postgres, (String, f64, String, String, String)>(
        "SELECT dt.type, CAST(dt.amount AS DOUBLE PRECISION), to_char(dt.date, 'YYYY-MM-DD'), COALESCE(dt.source, ''), COALESCE(dt.note, '') \
         FROM deposit_transactions dt \
         JOIN plans p ON p.id = dt.plan_id \
         WHERE p.user_id = $1 AND dt.deleted_at IS NULL AND p.deleted_at IS NULL \
           AND p.plan_types @> ARRAY['deposit'] \
         ORDER BY dt.date",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .into_iter()
    .map(|(ty, amount, date, source, note)| {
        serde_json::json!({"type": ty, "amount": amount, "date": date, "source": source, "note": note})
    })
    .collect();

    Ok(Json(ExportData {
        categories,
        expenses,
        budgets,
        deposit_plans,
        deposit_transactions,
    }))
}

pub async fn import_all(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Json(data): Json<ImportData>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // 先清空当前用户的全部数据（逻辑删除），实现覆盖导入
    let _ = sqlx::query("UPDATE categories SET deleted_at = NOW() WHERE user_id = $1")
        .bind(user_id).execute(&db).await;
    let _ = sqlx::query("UPDATE expenses SET deleted_at = NOW() WHERE user_id = $1")
        .bind(user_id).execute(&db).await;
    let _ = sqlx::query("UPDATE budgets SET deleted_at = NOW() WHERE user_id = $1")
        .bind(user_id).execute(&db).await;
    let _ = sqlx::query(
        "UPDATE deposit_transactions dt SET deleted_at = NOW() FROM plans p \
         WHERE p.id = dt.plan_id AND p.user_id = $1",
    )
    .bind(user_id).execute(&db).await;
    let _ = sqlx::query("UPDATE plans SET deleted_at = NOW() WHERE user_id = $1 AND plan_types @> ARRAY['deposit']")
        .bind(user_id).execute(&db).await;

    if let Some(categories) = data.categories {
        for c in categories {
            let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let excluded = c.get("excluded").and_then(|v| v.as_bool()).unwrap_or(false);
            let sort_order = c.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            if !name.is_empty() {
                let _ = sqlx::query(
                    "INSERT INTO categories (user_id, name, excluded, sort_order) VALUES ($1, $2, $3, $4) \
                     ON CONFLICT (user_id, name) DO UPDATE SET excluded = $3, sort_order = $4",
                )
                .bind(user_id)
                .bind(name)
                .bind(excluded)
                .bind(sort_order)
                .execute(&db)
                .await;
            }
        }
    }

    if let Some(expenses) = data.expenses {
        for e in expenses {
            let amount = e.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let category = e.get("category").and_then(|v| v.as_str()).unwrap_or("");
            let date_str = e.get("date").and_then(|v| v.as_str()).unwrap_or("");
            let note = e.get("note").and_then(|v| v.as_str()).unwrap_or("");
            let ty = e.get("type").and_then(|v| v.as_str()).unwrap_or("expense");
            if amount > 0.0 && !category.is_empty() && !date_str.is_empty() {
                if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                    let _ = sqlx::query(
                        "INSERT INTO expenses (user_id, amount, type, category, date, note, created_by) \
                         VALUES ($1, $2, $3, $4, $5, $6, $7)",
                    )
                    .bind(user_id)
                    .bind(amount)
                    .bind(if ty == "income" { "income" } else { "expense" })
                    .bind(category)
                    .bind(date)
                    .bind(note)
                    .bind(user_id)
                    .execute(&db)
                    .await;
                }
            }
        }
    }

    if let Some(budgets) = data.budgets {
        for b in budgets {
            let month = b.get("month").and_then(|v| v.as_str()).unwrap_or("");
            let category = b.get("category").and_then(|v| v.as_str()).unwrap_or("");
            let amount = b.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let split_by_day = b.get("split_by_day").and_then(|v| v.as_bool()).unwrap_or(true);
            if !month.is_empty() && !category.is_empty() {
                let _ = sqlx::query(
                    "INSERT INTO budgets (user_id, month, category, amount, split_by_day) \
                     VALUES ($1, $2, $3, $4, $5) \
                     ON CONFLICT (user_id, month, category) DO UPDATE SET amount = $4, split_by_day = $5",
                )
                .bind(user_id)
                .bind(month)
                .bind(category)
                .bind(amount)
                .bind(split_by_day)
                .execute(&db)
                .await;
            }
        }
    }

    if let Some(plans) = data.deposit_plans {
        for p in plans {
            let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let monthly_goal = p.get("monthly_goal").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if !name.is_empty() {
                let _ = sqlx::query(
                    "INSERT INTO plans (user_id, name, plan_types, monthly_goal) VALUES ($1, $2, ARRAY['deposit'], $3)",
                )
                .bind(user_id)
                .bind(name)
                .bind(monthly_goal)
                .execute(&db)
                .await;
            }
        }
    }

    Ok(Json(serde_json::json!({"status": "imported"})))
}
