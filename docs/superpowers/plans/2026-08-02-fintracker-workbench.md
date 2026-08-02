# FinTracker 工作台升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 `docs/superpowers/specs/2026-08-02-fintracker-workbench-design.md` 完成：共享范围权限修复、新增待办/计划/工作台概览（后端 + Web 前端）、全页面响应式适配。

**Architecture:** 沿用现有前后端分离架构。后端新增 `todos`/`plans` 两张表与三个处理模块（todos.rs / plans.rs / workbench.rs），全部走 JWT 鉴权、按 user_id 隔离、逻辑删除；前端新增三个页面与对应 API 服务层，MainLayout 桌面端顶部导航、移动端左侧抽屉，各页面窄屏自适应。

**Tech Stack:** Rust Axum 0.8 + SQLx 0.8 + PostgreSQL、React 19 + TypeScript + Ant Design 6 + React Router 7 + recharts、Vite 8。

## Global Constraints

- 所有新数据表必须带 `user_id` 并按用户隔离；查询一律 `deleted_at IS NULL`
- 逻辑删除：不物理删除；`plans.deleted_at` 置空 `todos.plan_id` 外键用 `ON DELETE SET NULL` 兜底
- 计划进度规则：有关联待办时自动统计 `round(已完成/总数*100)`，无待办时用 `plans.progress`
- 本期待办/计划**不做共享**（不合并共享伙伴数据）
- 前端保持现有配色（主色 `#1a1a2e`）与组件风格
- 路由：`/` = 工作台；新增 `/todos`、`/plans`；原有路由不变
- 移动端导航：<768px 时顶部只留品牌 + 汉堡按钮，左侧抽屉（antd Drawer）展示全部导航与工具栏操作
- 验收命令：`cargo check`、`tsc --noEmit`、curl 联调、浏览器 375/768/1280px 逐页检查

---

## 文件结构

**后端新增**
- `backend/migrations/002_todos_plans.sql` — 两张新表
- `backend/src/handlers/todos.rs` — 待办 CRUD
- `backend/src/handlers/plans.rs` — 计划 CRUD（含进度统计）
- `backend/src/handlers/workbench.rs` — 工作台概览

**后端修改**
- `backend/src/main.rs` — 注册新模块与路由
- `backend/src/handlers/sharing.rs` — 权限修复

**前端新增**
- `frontend/src/services/todoApi.ts` / `planApi.ts` / `workbenchApi.ts`
- `frontend/src/pages/WorkbenchPage.tsx` / `TodosPage.tsx` / `PlansPage.tsx`

**前端修改**
- `frontend/src/types/api.ts` — Todo/Plan/WorkbenchSummary 类型
- `frontend/src/App.tsx` — 路由
- `frontend/src/layouts/MainLayout.tsx` — 导航 + 移动端抽屉 + 响应式
- 现有页面/组件响应式微调（内边距、minWidth）
- `frontend/src/index.css` — 响应式辅助（如需要）

**部署脚本**
- `deploy/deploy.sh` — 执行全部迁移文件

---

### Task 1: 共享范围权限修复

**Files:**
- Modify: `backend/src/handlers/sharing.rs`（`update_scope` 函数）

**Interfaces:**
- 无变化：`PUT /api/share/{id}/scope` 请求/响应结构不变

- [ ] **Step 1: 修改 SQL 权限条件**

把 `update_scope` 中的更新语句改为：

```rust
let sharing = sqlx::query_as::<_, Sharing>(
    "UPDATE sharing SET scope = $1 WHERE id = $2 AND (user_a_id = $3 OR user_b_id = $3) \
     RETURNING id, user_a_id, user_b_id, status, invite_code, confirmed_by_b, scope, created_at",
)
```

- [ ] **Step 2: 编译验证**

Run: `cargo check`（backend 目录）
Expected: 无错误

- [ ] **Step 3: 接口回归验证**

Run（本地服务重启后）：
1. 注册 A、B，A 生成邀请码，B 接受
2. B 执行 `PUT /api/share/{id}/scope` → HTTP 200
3. A 执行同样请求 → HTTP 200

- [ ] **Step 4: Commit**

```bash
git add backend/src/handlers/sharing.rs
git commit -m "fix: 共享范围允许双方修改"
```

---

### Task 2: 数据库迁移 002（todos + plans）

**Files:**
- Create: `backend/migrations/002_todos_plans.sql`

- [ ] **Step 1: 编写迁移文件**

```sql
-- 002_todos_plans.sql
-- 目标型计划表
CREATE TABLE plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    deadline DATE,
    progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 待办事项表
CREATE TABLE todos (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    due_date DATE,
    done BOOLEAN DEFAULT FALSE,
    plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_todos_user ON todos(user_id);
CREATE INDEX idx_todos_plan ON todos(plan_id);
CREATE INDEX idx_plans_user ON plans(user_id);
```

- [ ] **Step 2: 应用到本地数据库**

Run: `psql -U postgres -h localhost -d fintracker -f backend/migrations/002_todos_plans.sql`
Expected: 两张表 + 三个索引创建成功

- [ ] **Step 3: 验证表结构**

Run: `psql -U postgres -h localhost -d fintracker -c "\dt"` → 出现 `plans`、`todos`

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/002_todos_plans.sql
git commit -m "feat: 新增待办/计划表迁移"
```

---

### Task 3: 待办 API（todos.rs）

**Files:**
- Create: `backend/src/handlers/todos.rs`

**Interfaces:**
- Produces: `list`、`create`、`update`、`delete` 四个 async 函数，签名与 expenses.rs 一致（`State<PgPool>` + `Extension<i32>` user_id）
- Produces: `Todo` struct（含 `plan_name: Option<String>` 关联查询字段）

- [ ] **Step 1: 编写完整处理模块**

```rust
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};

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

const TODO_SELECT: &str = "SELECT t.id, t.user_id, t.title, t.due_date, t.done, t.plan_id, \
     p.name AS plan_name, t.created_at, t.updated_at, t.deleted_at \
     FROM todos t LEFT JOIN plans p ON p.id = t.plan_id AND p.deleted_at IS NULL";

pub async fn list(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<TodoQuery>,
) -> Result<Json<Vec<Todo>>, StatusCode> {
    let mut sql = String::from(TODO_SELECT);
    sql.push_str(" WHERE t.user_id = $1 AND t.deleted_at IS NULL");
    let mut n: i32 = 1;
    if let Some(done) = query.done {
        n += 1;
        sql.push_str(&format!(" AND t.done = ${}", n));
        let _ = done;
    }
    if let Some(pid) = query.plan_id {
        n += 1;
        sql.push_str(&format!(" AND t.plan_id = ${}", n));
        let _ = pid;
    }
    if let Some(date) = &query.date {
        n += 1;
        sql.push_str(&format!(" AND t.due_date = ${}", n));
        let _ = date;
    }
    sql.push_str(" ORDER BY t.done ASC, t.due_date ASC NULLS LAST, t.created_at DESC LIMIT 1000");

    let mut q = sqlx::query_as::<_, Todo>(&sql).bind(user_id);
    if let Some(done) = query.done { q = q.bind(done); }
    if let Some(pid) = query.plan_id { q = q.bind(pid); }
    if let Some(date) = &query.date {
        let parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)?;
        q = q.bind(parsed);
    }
    let rows = q.fetch_all(&db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows))
}

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
    let existing = sqlx::query_as::<_, Todo>(&format!("{} WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NULL", TODO_SELECT))
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
         WHERE id = $5 RETURNING id, user_id, title, due_date, done, plan_id, NULL AS plan_name, created_at, updated_at, deleted_at",
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
        "UPDATE todos SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
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
```

- [ ] **Step 2: 编译验证** `cargo check` 通过

- [ ] **Step 3: Commit**

```bash
git add backend/src/handlers/todos.rs
git commit -m "feat: 待办 CRUD API"
```

---

### Task 4: 计划 API（plans.rs，含进度统计）

**Files:**
- Create: `backend/src/handlers/plans.rs`

**Interfaces:**
- Produces: `list`、`create`、`update`、`delete`；`Plan` struct 含 `progress/done_count/total_count`（读取时计算）

- [ ] **Step 1: 编写完整处理模块**

```rust
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Plan {
    pub id: i32,
    pub user_id: i32,
    pub name: String,
    pub deadline: Option<chrono::NaiveDate>,
    pub progress: i32,
    pub done_count: i64,
    pub total_count: i64,
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

const PLAN_SELECT: &str = "SELECT p.id, p.user_id, p.name, p.deadline, \
     CASE WHEN COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) > 0 \
          THEN ROUND(100.0 * COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.done) \
               / COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL))::int \
          ELSE p.progress END AS progress, \
     COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS total_count, \
     COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.done) AS done_count, \
     p.archived, p.archived_at, p.created_at, p.updated_at, p.deleted_at \
     FROM plans p LEFT JOIN todos t ON t.plan_id = p.id";

fn parse_date(s: &str) -> Result<chrono::NaiveDate, StatusCode> {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| StatusCode::UNPROCESSABLE_ENTITY)
}

pub async fn list(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Query(query): Query<PlanQuery>,
) -> Result<Json<Vec<Plan>>, StatusCode> {
    let mut sql = String::from(PLAN_SELECT);
    sql.push_str(" WHERE p.user_id = $1 AND p.deleted_at IS NULL");
    if let Some(archived) = query.archived {
        sql.push_str(&format!(" AND p.archived = {}", archived));
    }
    sql.push_str(" GROUP BY p.id ORDER BY p.archived ASC, p.deadline ASC NULLS LAST, p.created_at DESC LIMIT 1000");
    let rows = sqlx::query_as::<_, Plan>(&sql)
        .bind(user_id)
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
         RETURNING id, user_id, name, deadline, progress, 0 AS done_count, 0 AS total_count, \
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
    let existing = sqlx::query_as::<_, Plan>(&format!("{} WHERE p.id = $1 AND p.user_id = $2 AND p.deleted_at IS NULL GROUP BY p.id", PLAN_SELECT))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

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

    let plan = sqlx::query_as::<_, Plan>(
        "UPDATE plans SET name = $1, deadline = $2, progress = $3, archived = $4, \
                archived_at = CASE WHEN $4 AND archived_at IS NULL THEN NOW() WHEN NOT $4 THEN NULL ELSE archived_at END, \
                updated_at = NOW() \
         WHERE id = $5 \
         RETURNING id, user_id, name, deadline, progress, 0 AS done_count, 0 AS total_count, \
                   archived, archived_at, created_at, updated_at, deleted_at",
    )
    .bind(&name)
    .bind(deadline)
    .bind(progress)
    .bind(archived)
    .bind(id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(plan))
}

pub async fn delete(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
    Path(id): Path<i32>,
) -> StatusCode {
    let result = sqlx::query(
        "UPDATE plans SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
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
```

- [ ] **Step 2: 编译验证** `cargo check` 通过

- [ ] **Step 3: Commit**

```bash
git add backend/src/handlers/plans.rs
git commit -m "feat: 计划 CRUD API（含自动进度统计）"
```

---

### Task 5: 工作台概览 API（workbench.rs）

**Files:**
- Create: `backend/src/handlers/workbench.rs`

**Interfaces:**
- Produces: `summary` async 函数；返回 `WorkbenchSummary`
- Consumes: `crate::handlers::todos::Todo`、`crate::handlers::plans::Plan`

- [ ] **Step 1: 编写处理模块**

```rust
use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;
use sqlx::PgPool;

use crate::handlers::plans::Plan;
use crate::handlers::todos::Todo;

#[derive(Debug, Serialize)]
pub struct WorkbenchSummary {
    pub month_total: f64,
    pub month_budget: f64,
    pub today_todo_count: i64,
    pub open_todo_count: i64,
    pub active_plan_count: i64,
    pub recent_todos: Vec<Todo>,
    pub active_plans: Vec<Plan>,
}

pub async fn summary(
    State(db): State<PgPool>,
    axum::extract::Extension(user_id): axum::extract::Extension<i32>,
) -> Result<Json<WorkbenchSummary>, StatusCode> {
    let now = chrono::Local::now();
    let month = now.format("%Y-%m").to_string();
    let today = now.format("%Y-%m-%d").to_string();

    let month_total: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses \
         WHERE user_id = $1 AND deleted_at IS NULL AND to_char(date, 'YYYY-MM') = $2",
    )
    .bind(user_id)
    .bind(&month)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let month_budget: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM budgets \
         WHERE user_id = $1 AND deleted_at IS NULL AND month = $2",
    )
    .bind(user_id)
    .bind(&month)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let today_todo_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM todos \
         WHERE user_id = $1 AND deleted_at IS NULL AND done = false AND due_date <= $2::date",
    )
    .bind(user_id)
    .bind(&today)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let open_todo_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM todos WHERE user_id = $1 AND deleted_at IS NULL AND done = false",
    )
    .bind(user_id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let active_plan_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM plans WHERE user_id = $1 AND deleted_at IS NULL AND archived = false",
    )
    .bind(user_id)
    .fetch_one(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let recent_todos = sqlx::query_as::<_, Todo>(
        "SELECT t.id, t.user_id, t.title, t.due_date, t.done, t.plan_id, \
                p.name AS plan_name, t.created_at, t.updated_at, t.deleted_at \
         FROM todos t LEFT JOIN plans p ON p.id = t.plan_id AND p.deleted_at IS NULL \
         WHERE t.user_id = $1 AND t.deleted_at IS NULL AND t.done = false \
         ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC LIMIT 5",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let active_plans = sqlx::query_as::<_, Plan>(
        "SELECT p.id, p.user_id, p.name, p.deadline, \
                CASE WHEN COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) > 0 \
                     THEN ROUND(100.0 * COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.done) \
                          / COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL))::int \
                     ELSE p.progress END AS progress, \
                COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS total_count, \
                COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.done) AS done_count, \
                p.archived, p.archived_at, p.created_at, p.updated_at, p.deleted_at \
         FROM plans p LEFT JOIN todos t ON t.plan_id = p.id \
         WHERE p.user_id = $1 AND p.deleted_at IS NULL AND p.archived = false \
         GROUP BY p.id ORDER BY p.deadline ASC NULLS LAST, p.created_at DESC LIMIT 5",
    )
    .bind(user_id)
    .fetch_all(&db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(WorkbenchSummary {
        month_total,
        month_budget,
        today_todo_count,
        open_todo_count,
        active_plan_count,
        recent_todos,
        active_plans,
    }))
}
```

- [ ] **Step 2: 编译验证** `cargo check` 通过

- [ ] **Step 3: Commit**

```bash
git add backend/src/handlers/workbench.rs
git commit -m "feat: 工作台概览 API"
```

---

### Task 6: 注册路由（main.rs）

**Files:**
- Modify: `backend/src/main.rs`

- [ ] **Step 1: 注册模块与路由**

在 `mod handlers` 块中追加：

```rust
    pub mod plans;
    pub mod todos;
    pub mod workbench;
```

在 `protected_routes` 中追加：

```rust
        // Todos
        .route("/api/todos", get(handlers::todos::list))
        .route("/api/todos", post(handlers::todos::create))
        .route("/api/todos/{id}", put(handlers::todos::update))
        .route("/api/todos/{id}", delete(handlers::todos::delete))
        // Plans
        .route("/api/plans", get(handlers::plans::list))
        .route("/api/plans", post(handlers::plans::create))
        .route("/api/plans/{id}", put(handlers::plans::update))
        .route("/api/plans/{id}", delete(handlers::plans::delete))
        // Workbench
        .route(
            "/api/workbench/summary",
            get(handlers::workbench::summary),
        )
```

- [ ] **Step 2: 编译 + 重启后端 + 接口联调**

```powershell
cargo build
# 停旧进程 → 启动新进程
```

curl 验证（带 token）：
- `POST /api/todos`、`GET /api/todos`、`PUT /api/todos/{id}`、`DELETE /api/todos/{id}`
- `POST /api/plans`、`GET /api/plans`、`PUT /api/plans/{id}`（含 archived=true）
- `GET /api/workbench/summary`

- [ ] **Step 3: Commit**

```bash
git add backend/src/main.rs
git commit -m "feat: 注册待办/计划/工作台路由"
```

---

### Task 7: 前端类型与 API 服务层

**Files:**
- Modify: `frontend/src/types/api.ts`
- Create: `frontend/src/services/todoApi.ts`、`planApi.ts`、`workbenchApi.ts`

**Interfaces:**
- Produces: `Todo`、`CreateTodo`、`UpdateTodo`、`Plan`、`CreatePlan`、`UpdatePlan`、`WorkbenchSummary`
- Consumes: 既有 `apiClient`（axios 实例，自动带 token）

- [ ] **Step 1: types/api.ts 追加类型**

```ts
// === Todos ===
export interface Todo {
  id: number;
  user_id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  plan_id: number | null;
  plan_name: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface CreateTodo {
  title: string;
  due_date?: string | null;
  plan_id?: number | null;
  done?: boolean;
}

export interface UpdateTodo {
  title?: string;
  due_date?: string | null;
  plan_id?: number | null;
  done?: boolean;
}

// === Plans ===
export interface Plan {
  id: number;
  user_id: number;
  name: string;
  deadline: string | null;
  progress: number;
  done_count: number;
  total_count: number;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface CreatePlan {
  name: string;
  deadline?: string | null;
  progress?: number;
}

export interface UpdatePlan {
  name?: string;
  deadline?: string | null;
  progress?: number;
  archived?: boolean;
}

// === Workbench ===
export interface WorkbenchSummary {
  month_total: number;
  month_budget: number;
  today_todo_count: number;
  open_todo_count: number;
  active_plan_count: number;
  recent_todos: Todo[];
  active_plans: Plan[];
}
```

- [ ] **Step 2: 创建三个服务文件**

`todoApi.ts`：

```ts
import apiClient from './apiClient';
import type { Todo, CreateTodo, UpdateTodo } from '../types/api';

export const todoApi = {
  list: (params?: { done?: boolean; plan_id?: number; date?: string }) =>
    apiClient.get<Todo[]>('/todos', { params }).then((r) => r.data),
  create: (data: CreateTodo) =>
    apiClient.post<Todo>('/todos', data).then((r) => r.data),
  update: (id: number, data: UpdateTodo) =>
    apiClient.put<Todo>(`/todos/${id}`, data).then((r) => r.data),
  delete: (id: number) => apiClient.delete(`/todos/${id}`),
};
```

`planApi.ts`：

```ts
import apiClient from './apiClient';
import type { Plan, CreatePlan, UpdatePlan } from '../types/api';

export const planApi = {
  list: (params?: { archived?: boolean }) =>
    apiClient.get<Plan[]>('/plans', { params }).then((r) => r.data),
  create: (data: CreatePlan) =>
    apiClient.post<Plan>('/plans', data).then((r) => r.data),
  update: (id: number, data: UpdatePlan) =>
    apiClient.put<Plan>(`/plans/${id}`, data).then((r) => r.data),
  delete: (id: number) => apiClient.delete(`/plans/${id}`),
};
```

`workbenchApi.ts`：

```ts
import apiClient from './apiClient';
import type { WorkbenchSummary } from '../types/api';

export const workbenchApi = {
  summary: () =>
    apiClient.get<WorkbenchSummary>('/workbench/summary').then((r) => r.data),
};
```

- [ ] **Step 3: 类型检查** Run: `npx tsc --noEmit` → 无错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/services/todoApi.ts frontend/src/services/planApi.ts frontend/src/services/workbenchApi.ts
git commit -m "feat: 前端待办/计划/工作台 API 服务层"
```

---

### Task 8: 路由与导航改造（App.tsx + MainLayout）

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/layouts/MainLayout.tsx`

**Interfaces:**
- Consumes: `WorkbenchPage`、`TodosPage`、`PlansPage`（Task 9-11 产出，先建占位导出再补全，或本任务只改路由、页面在后续任务创建后 tsc 才通过）

- [ ] **Step 1: App.tsx 路由**

```tsx
import WorkbenchPage from './pages/WorkbenchPage';
import TodosPage from './pages/TodosPage';
import PlansPage from './pages/PlansPage';
// ...
<Route index element={<WorkbenchPage />} />
<Route path="todos" element={<TodosPage />} />
<Route path="plans" element={<PlansPage />} />
```

注意：`index` 路由由 `<Navigate to="/expenses" />` 改为 `<WorkbenchPage />`。

- [ ] **Step 2: MainLayout 导航与移动端抽屉**

导航项：

```ts
const NAV_TABS = [
  { path: '/', label: '工作台' },
  { path: '/expenses', label: '记账' },
  { path: '/budgets', label: '预算' },
  { path: '/deposits', label: '存款' },
  { path: '/statistics', label: '统计' },
  { path: '/sharing', label: '共享' },
  { path: '/todos', label: '待办' },
  { path: '/plans', label: '计划' },
];
```

- 引入 `Grid, Drawer, MenuOutlined`；`const screens = Grid.useBreakpoint(); const isMobile = !screens.md;`
- 移动端：顶部左侧汉堡按钮 `setDrawerOpen(true)`；`<Drawer placement="left" open={drawerOpen} onClose={...} title="FinTracker">` 内放导航按钮列表（`block`、选中态高亮）+ 底部工具栏按钮（复制/粘贴导入/导入Excel/导出Excel/退出登录）
- 桌面端保持现状：顶部完整导航 + 工具栏按钮
- 当前路径高亮判断：`location.pathname === tab.path`，`/` 需处理为精确匹配（`/` 用 `pathname === '/'`）
- 顶部品牌标题在移动端保留

- [ ] **Step 3: 类型检查 + 浏览器验证（桌面导航、移动端抽屉开关）**

Run: `npx tsc --noEmit`；DevTools 切 375px 验证汉堡按钮与抽屉。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/layouts/MainLayout.tsx
git commit -m "feat: 工作台路由与移动端抽屉导航"
```

---

### Task 9: 工作台页面 WorkbenchPage

**Files:**
- Create: `frontend/src/pages/WorkbenchPage.tsx`

**Interfaces:**
- Consumes: `workbenchApi.summary()`、`useNavigate`；`formatMoney`（utils/helpers）
- Produces: 默认导出组件；跳转 `/expenses`（记一笔）、`/todos`（新增待办）、`/plans`（新建计划）

- [ ] **Step 1: 实现页面**

结构：
- 顶部标题"工作台" + 刷新按钮
- 卡片区（antd `Row gutter` + `Col xs={24} md={12}`）：
  1. 本月支出卡：`month_total` / `month_budget` 与进度条（`Progress percent`，预算为 0 时不显示百分比或显示 100）
  2. 待办卡：`今天到期 X 项`、`未完成共 Y 项` + 最近 3 条（勾选框、标题、截止日期）+ "去处理 →" 跳 `/todos`
  3. 计划卡：`进行中 Z 个` + 前 3 条（名称、进度条）+ "查看全部 →" 跳 `/plans`
  4. 快速操作：三个按钮"记一笔 / 新增待办 / 新建计划"分别 `navigate('/expenses')`、`navigate('/todos')`、`navigate('/plans')`
- 加载中 `Spin`、失败 `message.error`、空数据显示友好文案
- 数据拉取：`useEffect` + `workbenchApi.summary()`

关键逻辑：

```tsx
const [summary, setSummary] = useState<WorkbenchSummary | null>(null);
const load = useCallback(async () => {
  try { setSummary(await workbenchApi.summary()); } catch { message.error('加载工作台失败'); }
}, []);
useEffect(() => { load(); }, [load]);
```

- [ ] **Step 2: 类型检查 + 浏览器验证（有数据/无数据）**

Run: `npx tsc --noEmit`；DevTools 375px 与 1280px 分别查看布局。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/WorkbenchPage.tsx
git commit -m "feat: 工作台概览首页"
```

---

### Task 10: 待办页面 TodosPage

**Files:**
- Create: `frontend/src/pages/TodosPage.tsx`

**Interfaces:**
- Consumes: `todoApi`、`planApi.list({ archived: false })`（供关联下拉）
- Produces: 默认导出组件

- [ ] **Step 1: 实现页面**

结构：
- 顶部：标题"待办" + 状态筛选（`Segmented`：全部/未完成/已完成）+ 计划筛选（`Select`，含"全部计划"）+ "新增待办"按钮
- 列表：antd `List` 或自定义行；未完成优先、按截止日期排序由后端保证；每行：`Checkbox`（勾选切换 done，调 `todoApi.update`）+ 标题（完成时加删除线样式）+ 截止日期（过期红色、今天橙色）+ 所属计划标签 + 编辑/删除按钮
- 新增/编辑：`Modal` + `Form`（title 必填、`DatePicker` 截止日期可清空、`Select` 关联计划可清空）；保存调 create/update 后刷新
- 删除：`Modal.confirm` 后调 `todoApi.delete`
- 空状态：`Empty`
- 移动端：操作按钮换行/图标化，行内文本溢出省略（`ellipsis`）

- [ ] **Step 2: 类型检查 + 浏览器验证（增删改查、勾选完成、按计划筛选）**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/TodosPage.tsx
git commit -m "feat: 待办页面"
```

---

### Task 11: 计划页面 PlansPage

**Files:**
- Create: `frontend/src/pages/PlansPage.tsx`

**Interfaces:**
- Consumes: `planApi`、`todoApi.list({ plan_id })`（归档回顾时查关联待办）
- Produces: 默认导出组件

- [ ] **Step 1: 实现页面**

结构：
- 顶部：标题"计划" + `Segmented`（进行中/已归档）+ "新建计划"按钮
- 进行中卡片（`Card` + `Row/Col`）：名称、截止日期、`Progress` 进度条（自动统计）、`X/Y 项待办`、按钮"归档"（`Modal.confirm` → `update(id, { archived: true })`）与"删除"
- 已归档卡片：只读信息 + "展开回顾"（`Collapse`，展开后 `todoApi.list({ plan_id })` 显示当时待办列表，已完成打勾样式）
- 新建/编辑 `Modal` + `Form`：名称必填、截止日期、进度（`InputNumber 0-100`，仅当计划无关联待办时生效——后端规则；前端展示时若 total_count>0 禁用手动进度）
- 删除：`Modal.confirm` → `planApi.delete`
- 空状态：`Empty`

- [ ] **Step 2: 类型检查 + 浏览器验证（新建、进度自动更新、归档、回顾）**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PlansPage.tsx
git commit -m "feat: 计划页面（含归档回顾）"
```

---

### Task 12: 现有页面响应式微调

**Files:**
- Modify: `frontend/src/pages/StatisticsPage.tsx`、`SharingPage.tsx`、`BudgetPage.tsx`、`DepositPage.tsx`、`ExpensePage.tsx`
- Modify: `frontend/src/components/BudgetOverviewCard.tsx`、`BudgetList.tsx`、`HistoryPanel.tsx`、`DepositPlanCard.tsx`（如存在固定宽度问题）
- Modify: `frontend/src/index.css`（补充窄屏辅助规则）

- [ ] **Step 1: 逐页核对并调整**

- 内边距 `padding: 24` → `clamp(12px, 3vw, 24px)`
- 卡片 `minWidth: 320` → `min(320px, 100%)`
- 固定 `width` 的容器改为 `maxWidth: '100%'`
- 两栏 `.two-col` 保持 flex-wrap（已有媒体查询则核对生效）
- 表格（如有）加 `scroll={{ x: 'max-content' }}`
- 统计页控制区 `flexWrap: 'wrap'`（已有则核对）

- [ ] **Step 2: 类型检查 + DevTools 375/768/1280 逐页检查**

Run: `npx tsc --noEmit`；逐页截图式核对无横向溢出。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages frontend/src/components frontend/src/index.css
git commit -m "style: 全页面响应式适配"
```

---

### Task 13: 部署脚本 + 端到端验收

**Files:**
- Modify: `deploy/deploy.sh`

- [ ] **Step 1: 迁移执行改为全部文件**

把：

```bash
sudo -u postgres psql -d "$DB_NAME" -f "$APP_DIR/backend/migrations/001_initial.sql" >/dev/null
```

替换为：

```bash
for f in "$APP_DIR/backend/migrations/"*.sql; do
  echo "  applying $(basename "$f")"
  sudo -u postgres psql -d "$DB_NAME" -f "$f" >/dev/null
done
```

- [ ] **Step 2: 后端全量接口联调（curl）**

1. 共享回归：B 修改 scope → 200
2. 待办：create → list → update(done=true) → delete
3. 计划：create → 关联待办 → 勾选完成 → `GET /api/plans` 进度=100 → archive → `GET /api/plans?archived=true` 可见
4. 工作台：`GET /api/workbench/summary` 各字段正确

- [ ] **Step 3: 前端类型检查 + 浏览器端到端**

Run: `npx tsc --noEmit`

浏览器走通：登录 → 工作台看到概览 → 新建计划 → 新建待办并关联 → 勾完成（工作台进度更新）→ 归档 → 回顾 → 手机尺寸检查各页面。

- [ ] **Step 4: 更新文档状态 + 最终 Commit + Push**

```bash
git add -A
git commit -m "docs: 工作台升级实施完成"
git push origin dev
```
