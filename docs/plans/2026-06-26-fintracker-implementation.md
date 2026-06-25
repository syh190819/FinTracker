# FinTracker 实施计划

> **给 AI 助手:** 使用子代理驱动开发技能按任务依次实施。

**目标:** 将一个纯静态 HTML 记账原型升级为全栈 Web 应用，支持用户认证、共享记账和多端同步。

**架构:** Monorepo 单仓库，Rust（Axum + SQLx）后端 + React（TypeScript + Ant Design）前端，PostgreSQL 数据库，JWT 令牌认证。

**技术栈:**
- 后端: Rust 1.94, Axum, SQLx, bcrypt, jsonwebtoken, tokio, serde
- 前端: React 19, TypeScript, Vite, Ant Design 5, React Router, recharts（图表）
- 数据库: PostgreSQL 18
- 工具: cargo, npm, git

---

## 第一阶段：项目初始化

### 任务 1：初始化 Rust 后端

**涉及文件:**
- 创建: `backend/Cargo.toml`
- 创建: `backend/src/main.rs`
- 创建: `backend/.env`

**步骤 1：编写 Cargo.toml**

```toml
[package]
name = "fintracker-backend"
version = "0.1.0"
edition = "2024"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "chrono", "uuid"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
bcrypt = "0.16"
jsonwebtoken = "9"
dotenvy = "0.15"
tower-http = { version = "0.6", features = ["cors"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

**步骤 2：编写 backend/.env**

```
DATABASE_URL=postgresql://postgres:你的密码@localhost:5432/fintracker
JWT_SECRET=fintracker-dev-secret-key-2026
SERVER_ADDR=0.0.0.0:8080
```

**步骤 3：编写 backend/src/main.rs — 最小化启动**

```rust
use axum::{Router, routing::get};
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "fintracker_backend=debug,tower_http=debug".into()))
        .init();

    let app = Router::new()
        .route("/api/health", get(|| async { "OK" }))
        .layer(CorsLayer::permissive());

    let addr = "0.0.0.0:8080";
    tracing::info!("服务启动于 {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

**步骤 4：运行验证**

```bash
cd backend
cargo run
# 预期输出: "服务启动于 0.0.0.0:8080"
# Ctrl+C 停止
```

### 任务 2：初始化 React 前端

**涉及文件:**
- 创建: `frontend/` 使用 Vite + React + TypeScript

**步骤 1：创建 Vite 项目**

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
```

**步骤 2：安装依赖包**

```bash
npm install antd @ant-design/icons react-router-dom axios dayjs recharts
```

**步骤 3：添加代理配置 — frontend/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})
```

**步骤 4：验证前端运行**

```bash
npm run dev
# 预期: 浏览器打开 http://localhost:3000
# Ctrl+C 停止
```

### 任务 3：创建 PostgreSQL 数据库

**涉及文件:**
- 创建: `backend/migrations/001_initial.sql`

**步骤 1：创建数据库**

```bash
psql -U postgres -c "CREATE DATABASE fintracker;"
```

**步骤 2：编写初始迁移 SQL**

```sql
-- migrations/001_initial.sql

-- 用户表
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 消费品类表
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(30) NOT NULL,
    excluded BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    deleted_at TIMESTAMP,
    UNIQUE(user_id, name)
);

-- 支出记录表
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    category VARCHAR(30) NOT NULL,
    date DATE NOT NULL,
    note TEXT DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 月度预算表
CREATE TABLE budgets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL,
    category VARCHAR(30) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    split_by_day BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP,
    UNIQUE(user_id, month, category)
);

-- 存款计划表
CREATE TABLE deposit_plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    category VARCHAR(30) DEFAULT '',
    monthly_goal DECIMAL(12,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    deleted_at TIMESTAMP
);

-- 存取流水表
CREATE TABLE deposit_transactions (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES deposit_plans(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('deposit', 'withdraw')),
    amount DECIMAL(12,2) NOT NULL,
    date DATE NOT NULL,
    source VARCHAR(50) DEFAULT '',
    note TEXT DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 共享关系表
CREATE TABLE sharing (
    id SERIAL PRIMARY KEY,
    user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    invite_code VARCHAR(20) UNIQUE NOT NULL,
    confirmed_by_b BOOLEAN DEFAULT FALSE,
    scope JSONB DEFAULT '{"expenses":true,"budgets":true,"deposits":true}',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_a_id, user_b_id)
);

-- 性能索引
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_budgets_user_month ON budgets(user_id, month);
CREATE INDEX idx_deposit_plans_user ON deposit_plans(user_id);
CREATE INDEX idx_sharing_user_a ON sharing(user_a_id);
CREATE INDEX idx_sharing_user_b ON sharing(user_b_id);
CREATE INDEX idx_expenses_deleted ON expenses(deleted_at);
```

**步骤 3：执行迁移**

```bash
psql -U postgres -d fintracker -f backend/migrations/001_initial.sql
```

---

## 第二阶段：后端核心开发

### 任务 4：数据库连接模块

**涉及文件:**
- 创建: `backend/src/db/mod.rs`

**步骤 1：编写 db/mod.rs**

```rust
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn init_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .expect("数据库连接失败")
}
```

**步骤 2：更新 main.rs 使用连接池**

将连接池添加到应用状态中：

```rust
use axum::extract::State;

#[derive(Clone)]
struct AppState {
    db: PgPool,
}

async fn main() {
    // ... tracing 设置 ...
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL 环境变量必须设置");
    let pool = db::init_pool(&database_url).await;

    let state = AppState { db: pool };

    let app = Router::new()
        .route("/api/health", get(|| async { "OK" }))
        .with_state(state)
        .layer(CorsLayer::permissive());

    // ... 其余代码不变 ...
}
```

### 任务 5：用户认证模块（模型 + 处理器）

**涉及文件:**
- 创建: `backend/src/models/user.rs`
- 创建: `backend/src/handlers/auth.rs`
- 创建: `backend/src/middleware/jwt.rs`
- 修改: `backend/src/main.rs`

**步骤 1：创建 models/user.rs**

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub password_hash: String,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: i32,
    pub username: String,
}
```

**步骤 2：编写 handlers/auth.rs**

实现功能：
- 注册：用 bcrypt 对密码做哈希，插入数据库，返回 JWT 令牌
- 登录：按用户名查找用户，用 bcrypt 校验密码，返回 JWT 令牌
- 使用 jsonwebtoken 创建 JWT，包含 user_id + username 声明，24 小时过期

**步骤 3：编写 middleware/jwt.rs**

实现功能：
- 使用 Axum 的 middleware::from_fn 编写 JWT 鉴权中间件
- 从请求头 `Authorization: Bearer <令牌>` 中提取令牌
- 验证令牌有效性，将 user_id 注入到请求扩展中
- 令牌缺失/无效/过期时返回 401 状态码

**步骤 4：接入 main.rs**

- 添加路由: POST /api/register, POST /api/login
- 创建受保护的路由组，挂载 JWT 中间件

### 任务 6：消费品类 CRUD

**涉及文件:**
- 创建: `backend/src/handlers/categories.rs`
- 接入 main.rs

API 接口:
- GET /api/categories → 查询当前用户的品类列表
- POST /api/categories → 新增品类
- PUT /api/categories/:id → 修改品类名称/排除状态/排序
- DELETE /api/categories/:id → 逻辑删除

### 任务 7：支出记录 CRUD

**涉及文件:**
- 创建: `backend/src/handlers/expenses.rs`

API 接口:
- GET /api/expenses?date=&month=&category= → 带筛选查询
- POST /api/expenses → 记一笔（设置 created_by 为当前用户）
- PUT /api/expenses/:id → 修改（设置 updated_by 为当前用户）
- DELETE /api/expenses/:id → 逻辑删除

注意：当用户 A 与用户 B 建立共享关系后，双方的支出数据都应可查。

### 任务 8：月度预算 CRUD

**涉及文件:**
- 创建: `backend/src/handlers/budgets.rs`

API 接口:
- GET /api/budgets?month= → 查询某月的预算
- POST /api/budgets → 创建/更新预算
- DELETE /api/budgets/:id → 逻辑删除

### 任务 9：存款计划 + 存取记录

**涉及文件:**
- 创建: `backend/src/handlers/deposits.rs`

API 接口:
- GET /api/deposit-plans → 查询计划列表（含计算后的余额）
- POST /api/deposit-plans → 创建新计划
- PUT /api/deposit-plans/:id → 修改计划
- DELETE /api/deposit-plans/:id → 逻辑删除
- POST /api/deposit-plans/:id/transactions → 存入/取出操作
- GET /api/deposit-plans/:id/transactions → 查询某计划的存取流水

### 任务 10：共享模块

**涉及文件:**
- 创建: `backend/src/handlers/sharing.rs`

API 接口:
- POST /api/share/invite → 生成邀请码
- POST /api/share/accept → 接受邀请（通过邀请码）
- GET /api/share/relationships → 查询共享关系列表
- PUT /api/share/:id/scope → 修改共享范围
- DELETE /api/share/:id → 解除共享

核心逻辑：
- 查询支出/预算/存款时，同时返回共享伙伴的数据
- 根据 scope 判断哪些数据类型共享了
- created_by 始终记录操作人

### 任务 11：统计 API

**涉及文件:**
- 创建: `backend/src/handlers/statistics.rs`

API 接口:
- GET /api/statistics/monthly?year=2026 → 月度总支出趋势
- GET /api/statistics/category?month=2026-06 → 品类支出分布
- GET /api/statistics/budget-vs-actual?month=2026-06 → 预算 vs 实际对比

### 任务 12：导入/导出

**涉及文件:**
- 创建: `backend/src/handlers/import_export.rs`

API 接口:
- GET /api/export → 导出用户全部数据为 JSON
- POST /api/import → 导入 JSON 数据

---

## 第三阶段：前端核心开发

### 任务 13：登录/注册页面

**涉及文件:**
- 创建: `frontend/src/pages/Login.tsx`
- 创建: `frontend/src/pages/Register.tsx`
- 创建: `frontend/src/api/auth.ts`
- 创建: `frontend/src/hooks/useAuth.tsx`
- 修改: `frontend/src/App.tsx`

### 任务 14：主应用布局 + 路由

**涉及文件:**
- 修改: `frontend/src/App.tsx`
- 创建: `frontend/src/components/AppLayout.tsx`
- 创建: `frontend/src/components/Navbar.tsx`

布局说明：
- 使用 Ant Design Layout，顶部导航栏包含所有 Tab 和工具按钮
- 受保护路由：未登录时自动跳转到登录页
- 顶部导航：记账 | 预算 | 存款 | 统计 | 共享 | [复制/导入/导出/头像]

### 任务 15：记账页面

**涉及文件:**
- 创建: `frontend/src/pages/ExpensePage.tsx`
- 创建: `frontend/src/components/BudgetProgress.tsx`
- 创建: `frontend/src/components/ExpenseForm.tsx`
- 创建: `frontend/src/components/HistoryList.tsx`

完全复刻原型：
- 本月预算进度条（注意：进度条不是环形图）
- "记一笔"表单（金额、品类、日期、备注）
- "已记录"可折叠历史列表，支持按日期筛选

### 任务 16：预算页面

**涉及文件:**
- 创建: `frontend/src/pages/BudgetPage.tsx`
- 创建: `frontend/src/components/BudgetForm.tsx`
- 创建: `frontend/src/components/CategoryManager.tsx`

完全复刻原型：
- 按品类设置月度预算（支持按天拆分开关）
- 预算复制到其他月份
- 品类管理（新增/删除，设置排除统计）
- 预算列表手风琴折叠面板

### 任务 17：存款页面

**涉及文件:**
- 创建: `frontend/src/pages/DepositPage.tsx`
- 创建: `frontend/src/components/DepositPlanCard.tsx`
- 创建: `frontend/src/components/DepositTransactionModal.tsx`

完全复刻原型：
- 计划卡片（名称、品类、路径、余额、进度）
- 存入/取出弹窗操作
- 拖拽排序

### 任务 18：统计页面

**涉及文件:**
- 创建: `frontend/src/pages/StatisticsPage.tsx`

自由发挥实现：
- 月度支出趋势折线图（recharts）
- 品类占比饼图/环形图
- 预算 vs 实际柱状对比图
- 月度/季度切换

### 任务 19：共享页面

**涉及文件:**
- 创建: `frontend/src/pages/SharingPage.tsx`
- 创建: `frontend/src/components/InviteCodeModal.tsx`
- 创建: `frontend/src/components/SharedPartnerCard.tsx`

功能说明：
- 生成邀请码并显示
- 通过邀请码接受共享邀请
- 共享伙伴列表，含勾选框设置共享范围
- 解除共享关系

### 任务 20：工具栏操作

**涉及文件:**
- 创建: `frontend/src/components/ToolbarActions.tsx`

功能说明：
- 复制数据（导出后再写入系统剪贴板）
- 粘贴导入（从剪贴板读取 JSON 并解析）
- 导入 Excel（使用 xlsx 库解析文件）
- 导出 Excel（使用 xlsx 库生成文件）

---

## 第四阶段：集成与收尾

### 任务 21：共享数据逻辑

在后端实现共享数据访问逻辑：
- 查询支出时，同时返回共享伙伴的支出（scope.expenses = true 时）
- 查询预算时，同时返回共享伙伴的预算
- 查询存款计划时，同时返回共享伙伴的计划
- 每条数据标注所属用户的用户名

### 任务 22：错误处理与边界情况

- 前端处理 401 响应（令牌过期 → 跳转登录页）
- 加载状态处理（Ant Design Spin 加载中组件）
- 空状态处理（Ant Design Empty 空状态组件）
- 网络错误提示

### 任务 23：Git 初始化与首次提交

```bash
cd D:/Repository/FinTracker
git init
git add .
git commit -m "feat: FinTracker 项目初始结构"
```

---

## 执行顺序一览

```
第一阶段：项目初始化
  任务 1  ── Rust 后端骨架
  任务 2  ── React 前端骨架
  任务 3  ── 数据库 + 迁移脚本

第二阶段：后端开发
  任务 4  ── 数据库连接
  任务 5  ── 用户认证（注册/登录/JWT）
  任务 6  ── 品类 CRUD
  任务 7  ── 支出记录 CRUD
  任务 8  ── 预算 CRUD
  任务 9  ── 存款 CRUD
  任务 10 ── 共享模块
  任务 11 ── 统计 API
  任务 12 ── 导入/导出

第三阶段：前端开发
  任务 13 ── 登录/注册页面
  任务 14 ── 布局 + 路由
  任务 15 ── 记账页面
  任务 16 ── 预算页面
  任务 17 ── 存款页面
  任务 18 ── 统计页面
  任务 19 ── 共享页面
  任务 20 ── 工具栏操作

第四阶段：集成收尾
  任务 21 ── 共享数据逻辑
  任务 22 ── 错误处理
  任务 23 ── Git 提交
```
