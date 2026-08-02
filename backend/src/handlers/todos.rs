use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, QueryBuilder};
use chrono::Datelike;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Todo {
    pub id: i32,
    pub user_id: i32,
    pub title: String,
    pub due_date: Option<chrono::NaiveDate>,
    pub done: bool,
    pub plan_id: Option<i32>,
    pub plan_name: Option<String>,
    pub parent_id: Option<i32>,
    pub deposit_plan_id: Option<i32>,
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
    pub parent_id: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTodo {
    pub title: Option<String>,
    pub due_date: Option<Option<String>>,
    pub plan_id: Option<Option<i32>>,
    pub done: Option<bool>,
    pub parent_id: Option<Option<i32>>,
}

pub(crate) const TODO_COLUMNS: &str = "t.id, t.user_id, t.title, t.due_date, t.done, t.plan_id, \
     p.name AS plan_name, t.parent_id, t.deposit_plan_id, t.created_at, t.updated_at, t.deleted_at";

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

async fn todo_belongs_to(db: &PgPool, user_id: i32, todo_id: i32) -> Result<bool, StatusCode> {
    let row: Option<(i32,)> = sqlx::query_as(
        "SELECT id FROM todos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(todo_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(row.is_some())
}

/// 沿 parent 链向上计算深度（计划=0，一级待办=1，最多返回 3）
async fn todo_depth(db: &PgPool, user_id: i32, mut id: i32) -> Result<usize, StatusCode> {
    let mut depth = 1usize;
    for _ in 0..3 {
        let row: Option<(Option<i32>,)> = sqlx::query_as(
            "SELECT parent_id FROM todos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(user_id)
        .fetch_optional(db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        match row {
            Some((Some(pid),)) => {
                id = pid;
                depth += 1;
            }
            _ => break,
        }
    }
    Ok(depth)
}

/// 懒生成：为开启自动待办的存款计划补当月存钱待办
pub(crate) async fn ensure_monthly_deposit_todos(
    db: &PgPool,
    user_id: i32,
) -> Result<(), StatusCode> {
    let now = chrono::Local::now();
    let month = now.format("%Y-%m").to_string();

    let plans = sqlx::query_as::<_, (i32, String, f64, i32)>(
        "SELECT id, name, CAST(monthly_goal AS DOUBLE PRECISION), auto_todo_day FROM plans \
         WHERE user_id = $1 AND deleted_at IS NULL AND auto_todo_enabled = true AND monthly_goal > 0 \
           AND plan_types @> ARRAY['deposit']",
    )
    .bind(user_id)
    .fetch_all(db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    for (plan_id, name, goal, day) in plans {
        let exists: Option<(i32,)> = sqlx::query_as(
            "SELECT t.id FROM todos t \
             WHERE t.user_id = $1 AND t.deposit_plan_id = $2 AND t.deleted_at IS NULL \
               AND to_char(t.due_date, 'YYYY-MM') = $3 LIMIT 1",
        )
        .bind(user_id)
        .bind(plan_id)
        .bind(&month)
        .fetch_optional(db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        if exists.is_none() {
            let first = chrono::NaiveDate::parse_from_str(&format!("{}-01", month), "%Y-%m-%d")
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let last_day = first
                .checked_add_months(chrono::Months::new(1))
                .and_then(|d| d.checked_sub_days(chrono::Days::new(1)))
                .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
            let due_day = (day as u32).min(last_day.day());
            let due_date =
                chrono::NaiveDate::from_ymd_opt(last_day.year(), last_day.month(), due_day)
                    .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
            let amount = goal.round() as i64;
            let title = format!("本月存入 ¥{} 到《{}》", amount, name);
            let _ = sqlx::query(
                "INSERT INTO todos (user_id, title, due_date, deposit_plan_id) \
                 VALUES ($1, $2, $3, $4)",
            )
            .bind(user_id)
            .bind(&title)
            .bind(due_date)
            .bind(plan_id)
            .execute(db)
            .await;
        }
    }
    Ok(())
}

pub async fn list(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<TodoQuery>,
) -> Result<Json<Vec<Todo>>, StatusCode> {
    ensure_monthly_deposit_todos(&db, user_id).await?;

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
        // 返回该计划下全部子孙待办（递归）
        qb.push(" AND t.id IN (WITH RECURSIVE sub AS (SELECT id FROM todos WHERE plan_id = ");
        qb.push_bind(pid);
        qb.push(" AND user_id = ");
        qb.push_bind(user_id);
        qb.push(
            " AND deleted_at IS NULL UNION \
             SELECT t2.id FROM todos t2 JOIN sub ON t2.parent_id = sub.id \
             WHERE t2.user_id = ",
        );
        qb.push_bind(user_id);
        qb.push(" AND t2.deleted_at IS NULL) SELECT id FROM sub)");
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
    if let Some(pid) = req.parent_id {
        if !todo_belongs_to(&db, user_id, pid).await? {
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
        if todo_depth(&db, user_id, pid).await? > 2 {
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
    }
    let done = req.done.unwrap_or(false);

    let todo = sqlx::query_as::<_, Todo>(
        "INSERT INTO todos (user_id, title, due_date, plan_id, done, parent_id) \
         VALUES ($1, $2, $3, $4, $5, $6) \
         RETURNING id, user_id, title, due_date, done, plan_id, NULL AS plan_name, \
                   parent_id, NULL AS deposit_plan_id, created_at, updated_at, deleted_at",
    )
    .bind(user_id)
    .bind(&title)
    .bind(due_date)
    .bind(req.plan_id)
    .bind(done)
    .bind(req.parent_id)
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
    let parent_id = match req.parent_id {
        Some(Some(pid)) => {
            if pid == id {
                return Err(StatusCode::UNPROCESSABLE_ENTITY);
            }
            if !todo_belongs_to(&db, user_id, pid).await? {
                return Err(StatusCode::UNPROCESSABLE_ENTITY);
            }
            if todo_depth(&db, user_id, pid).await? > 2 {
                return Err(StatusCode::UNPROCESSABLE_ENTITY);
            }
            Some(pid)
        }
        Some(None) => None,
        None => existing.parent_id,
    };
    let done = req.done.unwrap_or(existing.done);

    let todo = sqlx::query_as::<_, Todo>(
        "UPDATE todos SET title = $1, due_date = $2, plan_id = $3, done = $4, parent_id = $5, updated_at = NOW() \
         WHERE id = $6 \
         RETURNING id, user_id, title, due_date, done, plan_id, NULL AS plan_name, \
                   parent_id, NULL AS deposit_plan_id, created_at, updated_at, deleted_at",
    )
    .bind(&title)
    .bind(due_date)
    .bind(plan_id)
    .bind(done)
    .bind(parent_id)
    .bind(id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // 勾选完成时，级联完成全部子孙待办（取消勾选不影响子级）
    if done {
        let _ = sqlx::query(
            "WITH RECURSIVE tree AS (
                SELECT id FROM todos WHERE parent_id = $1 AND user_id = $2 AND deleted_at IS NULL
                UNION
                SELECT t.id FROM todos t JOIN tree ON t.parent_id = tree.id
                WHERE t.user_id = $2 AND t.deleted_at IS NULL
             )
             UPDATE todos SET done = true, updated_at = NOW()
             WHERE id IN (SELECT id FROM tree)",
        )
        .bind(id)
        .bind(user_id)
        .execute(&db)
        .await;
    }

    Ok(Json(todo))
}

pub async fn delete(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
) -> StatusCode {
    let result = sqlx::query(
        "WITH RECURSIVE tree AS (
            SELECT id FROM todos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
            UNION ALL
            SELECT t.id FROM todos t JOIN tree ON t.parent_id = tree.id
            WHERE t.user_id = $2 AND t.deleted_at IS NULL
         )
         UPDATE todos SET deleted_at = NOW(), updated_at = NOW() \
         WHERE id IN (SELECT id FROM tree)",
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
