# FinTracker 工作台升级设计文档

> 日期：2026-08-02 | 状态：已实施完成（2026-08-02）
> 关联需求：修复共享范围 bug、前端响应式适配、升级为"工作台"（新增待办/计划）

## 一、背景与目标

FinTracker 目前是记账应用（支出/预算/存款/统计/共享），存在两个问题：

1. 共享关系的"共享范围"修改对**被邀请方**报错（HTTP 404）
2. 前端页面在手机/平板窄屏下布局不友好

本次升级目标：

- 修复共享范围修改 bug
- 全部页面自适应手机/平板
- 升级为"工作台"：新增首页概览 + 待办事项 + 目标型计划，待办可关联计划

## 二、范围与边界

**本期范围（Web 端）**：

- 后端新增待办/计划/工作台概览 API + 数据库迁移
- Web 前端新增工作台/待办/计划页面，全部页面响应式改造
- 修复共享范围修改权限 bug

**不在本期范围**：

- 待办/计划的共享协作（个人使用，数据模型预留扩展）
- 微信小程序新增待办/计划（后端 API 就绪后二期接入）
- 计划提醒、子任务、标签、优先级等进阶功能

## 三、第一部分：共享范围 Bug 修复

### 现状

`backend/src/handlers/sharing.rs` 的 `update_scope` 更新语句：

```sql
UPDATE sharing SET scope = $1 WHERE id = $2 AND user_a_id = $3 ...
```

只有邀请方（user_a）能修改，被邀请方（user_b）操作返回 404。

### 修复

改为共享双方均可修改：

```sql
UPDATE sharing SET scope = $1 WHERE id = $2 AND (user_a_id = $3 OR user_b_id = $3) ...
```

与 `delete` 接口的权限逻辑保持一致。前端 `SharingPage` 不改交互，仅在后端修复后由联调验证。

## 四、第二部分：数据模型

新增迁移 `backend/migrations/002_todos_plans.sql`：

```sql
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

设计要点：

- 所有表带 `user_id` 并按用户隔离（**为将来共享预留**，升级时仅扩展查询逻辑）
- `plan_id` 删除计划时置空（`ON DELETE SET NULL`），待办不随计划删除
- 逻辑删除（`deleted_at`）与现有表一致

### 计划进度规则

- 计划下有未删除待办时：**自动统计** `round(已完成待办数 / 待办总数 × 100)`
- 计划下没有待办时：使用 `plans.progress` 手动值
- 进度在 API 读取时计算，不落库（保证与待办状态始终一致）

## 五、第三部分：后端 API

新增 `backend/src/handlers/todos.rs`、`plans.rs`、`workbench.rs`，沿用现有 Axum + SQLx 模式，全部挂到 JWT 保护路由下。

### 待办接口

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| GET | `/api/todos` | 查询，参数 `done`（bool）、`plan_id`、`date`（YYYY-MM-DD）；未完成优先、按截止日期排序，空截止日期的排最后 |
| POST | `/api/todos` | 新增：`title`（必填）、`due_date`、`plan_id`、`done` |
| PUT | `/api/todos/{id}` | 修改：`title`、`due_date`、`plan_id`、`done` 均可选 |
| DELETE | `/api/todos/{id}` | 逻辑删除 |

返回结构（含关联计划名）：

```json
{ "id": 1, "user_id": 1, "title": "买牛奶", "due_date": "2026-08-03",
  "done": false, "plan_id": 2, "plan_name": "八月生活计划",
  "created_at": "...", "updated_at": null, "deleted_at": null }
```

### 计划接口

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| GET | `/api/plans` | 查询，参数 `archived`（bool），默认返回未归档；未归档按截止日期排序 |
| POST | `/api/plans` | 新增：`name`（必填）、`deadline`、`progress`（默认 0） |
| PUT | `/api/plans/{id}` | 修改：`name`、`deadline`、`progress`、`archived` 均可选；归档时写 `archived_at` |
| DELETE | `/api/plans/{id}` | 逻辑删除 |

返回结构（含自动统计）：

```json
{ "id": 1, "user_id": 1, "name": "年底存2万", "deadline": "2026-12-31",
  "progress": 50, "done_count": 2, "total_count": 4,
  "archived": false, "archived_at": null,
  "created_at": "...", "updated_at": null, "deleted_at": null }
```

### 工作台概览接口

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| GET | `/api/workbench/summary` | 返回当月支出/预算、待办统计、进行中计划数、最近待办与计划 |

```json
{
  "month_total": 1234.56,
  "month_budget": 3000.00,
  "today_todo_count": 3,
  "open_todo_count": 5,
  "active_plan_count": 2,
  "recent_todos": [],
  "active_plans": []
}
```

- `today_todo_count`：截止日期为今天或已过期、未完成
- `recent_todos`：未完成前 5 条；`active_plans`：进行中前 5 条

### 数据归属

所有新增接口查询 `WHERE user_id = 当前用户 AND deleted_at IS NULL`，本期不做共享合并。

## 六、第四部分：前端页面与导航

### 路由

```
/            → 工作台（WorkbenchPage）
/todos       → 待办（TodosPage）
/plans       → 计划（PlansPage）
/expenses    → 记账（现有）
/budgets     → 预算（现有）
/deposits    → 存款（现有）
/statistics  → 统计（现有）
/sharing     → 共享（现有）
```

### 导航（MainLayout 改造）

- **桌面端**：顶部导航完整显示：工作台 | 记账 | 预算 | 存款 | 统计 | 共享 | 待办 | 计划；工具栏（复制/粘贴导入/导入Excel/导出Excel/用户菜单）保持顶部
- **手机/平板（< 768px）**：
  - 顶部只留品牌标题 + 汉堡按钮（左侧）与用户菜单（右侧）
  - 点击汉堡弹出 **antd Drawer（左侧抽屉）**，简洁列表展示全部导航项（图标 + 文字），选中后自动关闭；工具栏操作放抽屉底部
  - 抽屉支持点击遮罩/关闭按钮收起

### 响应式改造原则（全部现有页面）

- 两栏布局（如记账页、共享页）改为手机一列、平板两列（flex-wrap 已具备的核对 minWidth）
- 卡片固定 `minWidth: 320` 等改为响应式（`min(100%, 起效宽度)`）
- 大段内边距（`padding: 24`）在窄屏收紧到 12~16
- 长表格支持横向滚动；工具按钮换行或收纳
- 统计图表（recharts）已使用 ResponsiveContainer，无需改数据逻辑
- 保持现有配色与视觉风格（#1a1a2e 深海军蓝 + 灰白极简）

## 七、第五部分：工作台首页内容

WorkbenchPage 卡片式布局（手机一列、平板两列）：

1. **本月支出卡**：支出总额、预算额度、进度条（数据来自 statisticsApi + budgetApi）
2. **待办卡**：今日到期/未完成数量 + 最近 3 条未完成待办 + "去处理"入口
3. **计划卡**：进行中计划列表（名称、截止、进度条）前 3 条 + "查看全部"入口
4. **快速操作**：三个按钮分别跳转到记账页、待办页、计划页，并在目标页自动打开"新增"弹窗

## 八、第六部分：待办页 / 计划页

### TodosPage

- 列表未完成优先，按截止日期排序（无截止日期的排最后）
- 勾选完成 → 整行划线 + 变灰；再点恢复
- 新增/编辑弹窗：名称（必填）、截止日期（DatePicker）、关联计划（Select 下拉，可空）
- 筛选：全部 / 未完成 / 已完成；按计划筛选
- 空状态提示

### PlansPage

- 顶部 Tab 或分段：进行中 / 已归档
- 进行中：计划卡片（名称、截止日期、进度条、关联待办数 done/total），"归档"按钮
- 已归档：卡片只读展示，可**展开回顾**（计划信息 + 当时关联的待办列表）
- 新建/编辑：名称（必填）、截止日期；无关联待办时可手动填进度
- 删除走确认弹窗（逻辑删除）

## 九、第七部分：部署脚本同步

`deploy/deploy.sh` 目前只执行 `001_initial.sql`，改为执行 `backend/migrations/` 下全部 `*.sql`（按文件名排序），保证服务器建库时包含新表。

## 十、测试与验证

1. **后端**：`cargo check`；curl 联调全部新接口；回归验证共享范围（A/B 双方修改均 200）
2. **前端**：`tsc --noEmit`；本地跑通全流程
3. **端到端**：注册 → 建计划 → 建待办（关联计划）→ 勾选完成 → 计划进度自动更新 → 归档 → 归档区回顾
4. **响应式**：浏览器 DevTools 在 375px（手机）/ 768px（平板）/ 1280px（桌面）逐页检查
5. 本地数据库执行 `002_todos_plans.sql` 迁移

## 十一、涉及文件清单

**后端新增**：

- `backend/migrations/002_todos_plans.sql`
- `backend/src/handlers/todos.rs`
- `backend/src/handlers/plans.rs`
- `backend/src/handlers/workbench.rs`

**后端修改**：

- `backend/src/main.rs`（注册路由）
- `backend/src/handlers/sharing.rs`（权限修复）

**前端新增**：

- `frontend/src/services/todoApi.ts`
- `frontend/src/services/planApi.ts`
- `frontend/src/services/workbenchApi.ts`
- `frontend/src/pages/WorkbenchPage.tsx`
- `frontend/src/pages/TodosPage.tsx`
- `frontend/src/pages/PlansPage.tsx`

**前端修改**：

- `frontend/src/types/api.ts`（Todo / Plan / WorkbenchSummary 类型）
- `frontend/src/App.tsx`（路由）
- `frontend/src/layouts/MainLayout.tsx`（导航 + 移动端抽屉）
- 现有页面与组件（ExpensePage / BudgetPage / DepositPage / StatisticsPage / SharingPage 及子组件）响应式调整
- `frontend/src/index.css` / `App.css`（如需要补充响应式工具类）

**部署脚本修改**：

- `deploy/deploy.sh`（执行全部迁移）
