# FinTracker 记账联动 + 分级待办 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 `docs/superpowers/specs/2026-08-02-fintracker-linkage-hierarchy-design.md` 实现：支出关联计划、存款计划自动生成月度存钱待办、计划下最多三级分级待办（树形展示、父级提示）。

**Architecture:** 后端在现有 plans/todos/expenses/deposit_plans 上加字段与递归查询（迁移 003），前端加树形组件与表单字段；自动生成待办采用"读取时懒生成"。

**Tech Stack:** Rust Axum 0.8 + SQLx 0.8 + PostgreSQL、React 19 + TypeScript + Ant Design 6、Vite 8。

## Global Constraints

- 层级规则：计划 = 0 层，待办最深到第 3 层；创建/修改时校验父节点深度 ≤ 2，越界返回 422
- 父待办**不**随子待办自动完成；子待办全部完成时前端显示提示徽标
- 计划进度 = 全部子孙待办完成数 ÷ 子孙待办总数（递归统计）
- `todos.deposit_plan_id` 只由懒生成逻辑写入，接口不接受客户端设置
- 自动存钱待办：仅当 `auto_todo_enabled = true AND monthly_goal > 0`；标题 `本月存入 ¥<月目标> 到《<计划名>》`；截止 = `auto_todo_day`（超当月天数取月末）；旧月待办保留
- 逻辑删除：删父待办递归软删子孙
- 支出关联计划只用于统计展示，不影响计划进度
- 验收：`cargo check`、`tsc --noEmit`、`npm run build`、curl/浏览器 E2E

---

## 文件结构

**后端**
- 新增：`backend/migrations/003_linkage_todos_plans.sql`
- 修改：`backend/src/handlers/todos.rs`、`plans.rs`、`expenses.rs`、`deposits.rs`、`workbench.rs`

**前端**
- 修改：`frontend/src/types/api.ts`、`services/todoApi.ts`、`planApi.ts`、`expenseApi.ts`、`depositApi.ts`
- 新增：`frontend/src/utils/todoTree.ts`
- 修改：`frontend/src/pages/TodosPage.tsx`、`PlansPage.tsx`、`ExpensePage.tsx`、`DepositPage.tsx`、`WorkbenchPage.tsx`
- 修改：`frontend/src/components/ExpenseForm.tsx`、`HistoryPanel.tsx`、`DepositPlanCard.tsx`

---

### Task 1: 迁移 003

**Files:** Create `backend/migrations/003_linkage_todos_plans.sql`

- [ ] **Step 1: 编写迁移**

```sql
-- 003_linkage_todos_plans.sql
ALTER TABLE todos ADD COLUMN parent_id INTEGER REFERENCES todos(id) ON DELETE CASCADE;
ALTER TABLE todos ADD COLUMN deposit_plan_id INTEGER REFERENCES deposit_plans(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL;
ALTER TABLE deposit_plans
    ADD COLUMN auto_todo_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN auto_todo_day INTEGER DEFAULT 28 CHECK (auto_todo_day BETWEEN 1 AND 28);
CREATE INDEX idx_todos_parent ON todos(parent_id);
CREATE INDEX idx_expenses_plan ON expenses(plan_id);
```

- [ ] **Step 2: 应用迁移** `psql -U postgres -h localhost -d fintracker -f backend/migrations/003_linkage_todos_plans.sql`
- [ ] **Step 3: 验证列存在** `\d todos` / `\d expenses` / `\d deposit_plans`
- [ ] **Step 4: Commit** `git commit -m "feat: 联动与分级待办迁移 003"`

---

### Task 2: 待办后端（todos.rs）— 父子层级 + 懒生成

**Files:** Modify `backend/src/handlers/todos.rs`

**Interfaces:**
- `Todo` 增加 `parent_id: Option<i32>`、`deposit_plan_id: Option<i32>`；`TODO_COLUMNS` 同步加两列
- `CreateTodo` 增加 `parent_id: Option<i32>`；`UpdateTodo` 增加 `parent_id: Option<Option<i32>>`
- 新增 `pub(crate) async fn ensure_monthly_deposit_todos(db: &PgPool, user_id: i32) -> Result<(), StatusCode>`
- 新增私有 `todo_depth(db, user_id, id) -> Result<usize, StatusCode>`（沿 parent 链向上，最多查 3 层）

- [ ] **Step 1: 扩展结构与字段**

`Todo`/`TODO_COLUMNS` 增加 `t.parent_id`、`t.deposit_plan_id`；create/update 的 RETURNING 同步补两列；`CreateTodo`/`UpdateTodo` 增加 `parent_id`。

- [ ] **Step 2: 层级校验与递归删除**

```rust
async fn todo_depth(db: &PgPool, user_id: i32, mut id: i32) -> Result<usize, StatusCode> {
    let mut depth = 1usize;
    for _ in 0..3 {
        let row: Option<(Option<i32>,)> = sqlx::query_as(
            "SELECT parent_id FROM todos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        )
        .bind(id).bind(user_id)
        .fetch_optional(db).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        match row {
            Some((Some(pid),)) => { id = pid; depth += 1; }
            _ => break,
        }
    }
    Ok(depth)
}
```

create/update 中：若 `parent_id` 有值 → 校验父待办属于当前用户且 `todo_depth(parent) <= 2`，否则 422。

delete 改为递归软删：

```rust
pub async fn delete(...) -> StatusCode {
    let result = sqlx::query(
        "WITH RECURSIVE tree AS (
            SELECT id FROM todos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
            UNION ALL
            SELECT t.id FROM todos t JOIN tree ON t.parent_id = tree.id
            WHERE t.user_id = $2 AND t.deleted_at IS NULL
         )
         UPDATE todos SET deleted_at = NOW(), updated_at = NOW()
         WHERE id IN (SELECT id FROM tree)",
    )
    .bind(id).bind(user_id).execute(&db).await;
    match result { Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT, _ => StatusCode::NOT_FOUND }
}
```

- [ ] **Step 3: plan_id 筛选改为返回全部子孙**

`list` 中当 `plan_id` 有值时使用递归 CTE：

```rust
// SELECT ... FROM todos t LEFT JOIN plans p ...
// WHERE t.id IN (
//   WITH RECURSIVE sub AS (
//     SELECT id FROM todos WHERE plan_id = $N AND user_id = $U AND deleted_at IS NULL
//     UNION ALL
//     SELECT t2.id FROM todos t2 JOIN sub ON t2.parent_id = sub.id
//     WHERE t2.user_id = $U AND t2.deleted_at IS NULL
//   ) SELECT id FROM sub
// )
```

- [ ] **Step 4: 懒生成函数**

```rust
pub(crate) async fn ensure_monthly_deposit_todos(db: &PgPool, user_id: i32) -> Result<(), StatusCode> {
    let now = chrono::Local::now();
    let month = now.format("%Y-%m").to_string();
    let plans = sqlx::query_as::<_, (i32, String, f64, i32)>(
        "SELECT id, name, monthly_goal, auto_todo_day FROM deposit_plans \
         WHERE user_id = $1 AND deleted_at IS NULL AND auto_todo_enabled = true AND monthly_goal > 0",
    )
    .bind(user_id).fetch_all(db).await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    for (plan_id, name, goal, day) in plans {
        let exists: Option<(i32,)> = sqlx::query_as(
            "SELECT t.id FROM todos t \
             WHERE t.user_id = $1 AND t.deposit_plan_id = $2 AND t.deleted_at IS NULL \
               AND to_char(t.due_date, 'YYYY-MM') = $3 LIMIT 1",
        )
        .bind(user_id).bind(plan_id).bind(&month)
        .fetch_optional(db).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if exists.is_none() {
            let first = chrono::NaiveDate::parse_from_str(&format!("{}-01", month), "%Y-%m-%d")
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let last_day = first
                .checked_add_months(chrono::Months::new(1))
                .and_then(|d| d.checked_sub_days(chrono::Days::new(1)))
                .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
            let due_day = (day as u32).min(last_day.day());
            let due_date = chrono::NaiveDate::from_ymd_opt(last_day.year(), last_day.month(), due_day)
                .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
            let title = format!("本月存入 ¥{:.0} 到《{}》", goal, name);
            let _ = sqlx::query(
                "INSERT INTO todos (user_id, title, due_date, deposit_plan_id) VALUES ($1, $2, $3, $4)",
            )
            .bind(user_id).bind(&title).bind(due_date).bind(plan_id)
            .execute(db).await;
        }
    }
    Ok(())
}
```

（`auto_todo_day` 与 `monthly_goal` 实际类型以 deposits.rs 中定义为准：`monthly_goal` 为 f64、`auto_todo_day` 为 i32。）

- [ ] **Step 5: `list` 开头调用 `ensure_monthly_deposit_todos(&db, user_id).await?`**
- [ ] **Step 6: `cargo check` + 联调**（层级、递归删除、懒生成）
- [ ] **Step 7: Commit** `git commit -m "feat: 待办分级与月度存钱待办懒生成"`

---

### Task 3: 计划后端（plans.rs）— 子孙进度 + 关联支出

**Files:** Modify `backend/src/handlers/plans.rs`

**Interfaces:**
- `Plan` 增加 `expense_total: f64`

- [ ] **Step 1: 重写 PLAN_COLUMNS 为递归统计**

```sql
-- 每张计划：progress/done_count/total_count 统计全部子孙待办
WITH RECURSIVE all_todos AS (
    SELECT id, plan_id, parent_id, done FROM todos
    WHERE user_id = $U AND deleted_at IS NULL AND plan_id IS NOT NULL
    UNION ALL
    SELECT t.id, a.plan_id, t.parent_id, t.done
    FROM todos t JOIN all_todos a ON t.parent_id = a.id
    WHERE t.user_id = $U AND t.deleted_at IS NULL
)
SELECT p.id, p.user_id, p.name, p.deadline,
       CASE WHEN COUNT(ad.id) > 0
            THEN ROUND(100.0 * COUNT(ad.id) FILTER (WHERE ad.done) / COUNT(ad.id))::int
            ELSE p.progress END AS progress,
       COUNT(ad.id) FILTER (WHERE ad.done) AS done_count,
       COUNT(ad.id) AS total_count,
       (SELECT CAST(COALESCE(SUM(e.amount),0) AS DOUBLE PRECISION) FROM expenses e
        WHERE e.plan_id = p.id AND e.deleted_at IS NULL) AS expense_total,
       p.archived, p.archived_at, p.created_at, p.updated_at, p.deleted_at
FROM plans p LEFT JOIN all_todos ad ON ad.plan_id = p.id
```

`list`/`fetch_plan` 改为该 CTE 形式（`QueryBuilder` 组装 `WHERE p.user_id = $1 AND p.deleted_at IS NULL [AND p.archived = ...] GROUP BY p.id ORDER BY ...`）。

- [ ] **Step 2: create/update 的 RETURNING 增加 `0::DOUBLE PRECISION AS expense_total`**；update 走 `fetch_plan` 返回真实值（现有逻辑已满足）
- [ ] **Step 3: `cargo check` + 联调**（树形进度、expense_total）
- [ ] **Step 4: Commit** `git commit -m "feat: 计划进度递归统计与关联支出合计"`

---

### Task 4: 记账后端（expenses.rs）— 关联计划

**Files:** Modify `backend/src/handlers/expenses.rs`

**Interfaces:**
- `Expense` 增加 `plan_id: Option<i32>`、`plan_name: Option<String>`
- `CreateExpense` 增加 `plan_id: Option<i32>`；`UpdateExpense` 增加 `plan_id: Option<Option<i32>>`

- [ ] **Step 1: list 查询 LEFT JOIN plans**

```sql
SELECT e.id, e.user_id, CAST(e.amount AS DOUBLE PRECISION), e.category, e.date, e.note,
       e.created_by, e.created_at, e.updated_by, e.updated_at, e.deleted_at,
       e.plan_id, p.name AS plan_name
FROM expenses e LEFT JOIN plans p ON p.id = e.plan_id AND p.deleted_at IS NULL
WHERE e.user_id = $1 AND e.deleted_at IS NULL ...
```

- [ ] **Step 2: create/update 校验 plan 归属**（复用 todo 的 `plan_belongs_to` 思路）并把 `plan_id` 写入；RETURNING 补 `plan_id`、`NULL AS plan_name`
- [ ] **Step 3: `cargo check` + 联调**（带 plan_id 创建 → 列表返回 plan_name → 计划 expense_total 正确）
- [ ] **Step 4: Commit** `git commit -m "feat: 支出关联计划"`

---

### Task 5: 存款后端（deposits.rs）— 自动待办字段

**Files:** Modify `backend/src/handlers/deposits.rs`

**Interfaces:**
- `DepositPlan` 增加 `auto_todo_enabled: bool`、`auto_todo_day: i32`
- `CreatePlan`/`UpdatePlan`（存款计划）增加两个字段；`auto_todo_day` 校验 1-28

- [ ] **Step 1: 结构/查询/插入/更新同步新字段**（校验 `(1..=28).contains(&day)`）
- [ ] **Step 2: `cargo check` + 联调**
- [ ] **Step 3: Commit** `git commit -m "feat: 存款计划自动生成待办开关与提醒日"`

---

### Task 6: 工作台后端（workbench.rs）

**Files:** Modify `backend/src/handlers/workbench.rs`

- [ ] **Step 1: `summary` 中 recent_todos 查询前调用 `crate::handlers::todos::ensure_monthly_deposit_todos(&db, user_id).await?`**
- [ ] **Step 2: `cargo check` + 联调**（开开关后 summary 出现存钱待办）
- [ ] **Step 3: Commit** `git commit -m "feat: 工作台概览包含自动存钱待办"`

---

### Task 7: 前端类型与服务层（含类型重命名清理）

**Files:** Modify `frontend/src/types/api.ts`、`services/todoApi.ts`、`planApi.ts`、`expenseApi.ts`、`depositApi.ts`

**Interfaces:**
- `Todo` + `parent_id: number | null`、`deposit_plan_id: number | null`
- `Plan` + `expense_total: number`
- `Expense` + `plan_id: number | null`、`plan_name: string | null`；`CreateExpense`/`UpdateExpense` + `plan_id`
- `DepositPlan` + `auto_todo_enabled: boolean`、`auto_todo_day: number`
- **重命名清理**：存款计划请求类型从 `CreatePlan`/`UpdatePlan` 改为 `CreateDepositPlan`/`UpdateDepositPlan`（消除与目标计划同名接口的声明合并），`depositApi.ts` 与 `DepositPage.tsx` 同步改名

- [ ] **Step 1: 更新类型**
- [ ] **Step 2: 更新服务层**（todoApi 传 `parent_id`；expenseApi 传 `plan_id`；depositApi 传新字段）
- [ ] **Step 3: `tsc --noEmit`**
- [ ] **Step 4: Commit** `git commit -m "feat: 前端类型与服务层支持联动与分级"`

---

### Task 8: 待办页树形（todoTree + TodosPage）

**Files:** Create `frontend/src/utils/todoTree.ts`；Modify `frontend/src/pages/TodosPage.tsx`

- [ ] **Step 1: todoTree 工具**

```ts
export interface TodoNode extends Todo {
  children: TodoNode[];
  depth: number;
}

export function buildTodoTree(todos: Todo[]): TodoNode[] {
  const map = new Map<number, TodoNode>();
  todos.forEach((t) => map.set(t.id, { ...t, children: [], depth: 0 }));
  const roots: TodoNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const assignDepth = (nodes: TodoNode[], d: number) => {
    nodes.forEach((n) => { n.depth = d; assignDepth(n.children, d + 1); });
  };
  assignDepth(roots, 1);
  return roots;
}
```

- [ ] **Step 2: TodosPage 树形渲染**
  - 列表改为按计划分组 + 树形（缩进 = `depth * 20px`）
  - 父节点（有 children）显示折叠箭头（`DownOutlined`/`RightOutlined`），默认展开
  - 子待办全部完成（`children.length > 0 && children.every(c => c.done)`）→ 父行显示 Tag"子待办已全部完成"
  - 新增/编辑弹窗：选中"关联计划"后显示"上级待办"选择（该计划树中 depth ≤ 2 的节点，排除自身），未选计划则禁用
  - 自动存钱待办（`deposit_plan_id` 非空）显示存款图标，点击跳 `/deposits`
- [ ] **Step 3: `tsc --noEmit` + 浏览器验证**
- [ ] **Step 4: Commit** `git commit -m "feat: 待办页树形展示与子级完成提示"`

---

### Task 9: 计划页（PlansPage）— 任务树 + 关联支出 + 记一笔

**Files:** Modify `frontend/src/pages/PlansPage.tsx`

- [ ] **Step 1: 卡片增强**
  - 展示 `关联支出 ¥{expense_total}`（>0 时）
  - 新增"记一笔"按钮 → `navigate('/expenses?plan_id=' + plan.id + '&note=' + encodeURIComponent(plan.name))`
- [ ] **Step 2: 任务树**
  - 每张计划卡片增加"展开任务"折叠区；展开时 `todoApi.list({ plan_id })`（后端返回全部子孙）→ `buildTodoTree` 渲染（缩进、勾选态、完成划线；父节点显示折叠与"子待办已全部完成"提示）
- [ ] **Step 3: `tsc --noEmit` + 浏览器验证**
- [ ] **Step 4: Commit** `git commit -m "feat: 计划页任务树与关联支出"`

---

### Task 10: 记账页（ExpensePage / ExpenseForm / HistoryPanel）

**Files:** Modify `frontend/src/pages/ExpensePage.tsx`、`frontend/src/components/ExpenseForm.tsx`、`HistoryPanel.tsx`

- [ ] **Step 1: ExpensePage** 获取计划列表，读取 URL 参数：

```ts
const params = new URLSearchParams(window.location.search);
const initPlanId = params.get('plan_id') ? Number(params.get('plan_id')) : undefined;
const initNote = params.get('note') || undefined;
```

  - 向 `ExpenseForm` 传 `plans` 与初始 `planId`/`note`；保存成功后清空 URL 参数（`window.history.replaceState`）
- [ ] **Step 2: ExpenseForm** 增加"关联计划"`Select`（可选，options = 计划名）；从初始值预填
- [ ] **Step 3: HistoryPanel** 每行显示 `plan_name` Tag（若有）
- [ ] **Step 4: `tsc --noEmit` + 浏览器验证**（计划页点记一笔 → 表单自动带计划与备注）
- [ ] **Step 5: Commit** `git commit -m "feat: 记账关联计划与快捷预填"`

---

### Task 11: 存款页（DepositPage / DepositPlanCard）

**Files:** Modify `frontend/src/pages/DepositPage.tsx`、`frontend/src/components/DepositPlanCard.tsx`

- [ ] **Step 1: 新建/编辑弹窗**增加：
  - `Switch` "自动生成每月存钱待办"
  - 开启后显示 `InputNumber`（min 1 max 28）"每月提醒日"，默认 28
  - 保存时提交 `auto_todo_enabled`、`auto_todo_day`
- [ ] **Step 2: DepositPlanCard** 显示小 Tag"每月待办提醒"（开启时）
- [ ] **Step 3: `tsc --noEmit` + 浏览器验证**
- [ ] **Step 4: Commit** `git commit -m "feat: 存款计划自动待办设置"`

---

### Task 12: 工作台（WorkbenchPage）存钱待办跳转

**Files:** Modify `frontend/src/pages/WorkbenchPage.tsx`

- [ ] **Step 1: 待办卡条目**：`t.deposit_plan_id` 非空时显示存款图标并整行可点击 `navigate('/deposits')`
- [ ] **Step 2: `tsc --noEmit` + 验证**
- [ ] **Step 3: Commit** `git commit -m "feat: 工作台存钱待办可跳转存款页"`

---

### Task 13: 端到端验收 + 推送

- [ ] **Step 1: 后端接口回归**（curl/Invoke-RestMethod）：
  1. 建计划 → 建 L1/L2/L3 待办成功；给 L3 加子待办 → 422
  2. 完成部分子待办 → 计划进度正确（全部子孙口径）
  3. 删父待办 → 子孙全部软删
  4. 存款计划开开关（提醒日 20）→ `GET /api/todos` 出现"本月存入…"待办，截止 = 当月 20 日
  5. 创建支出带 `plan_id` → 列表带 `plan_name`、计划 `expense_total` 正确
  6. 工作台 summary 含存钱待办
- [ ] **Step 2: 前端** `tsc --noEmit` + `npm run build`
- [ ] **Step 3: 浏览器 E2E**：建三级待办 → 完成子级看提示 → 计划页展开树 → 记一笔自动预填 → 计划页关联支出 → 存款开关 → 待办页存钱待办 → 点击跳存款页 → 375px 复查
- [ ] **Step 4: 清理测试数据**
- [ ] **Step 5: Commit + Push**（含文档状态更新）
