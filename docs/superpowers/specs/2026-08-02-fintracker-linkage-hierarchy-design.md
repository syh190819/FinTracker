# FinTracker 记账联动 + 分级待办 设计文档

> 日期：2026-08-02 | 状态：已实施完成（2026-08-02）
> 关联：工作台升级（已完成）之上新增两套能力：记账/存款/待办/计划联动、计划下的分级待办（最多三级）

## 一、背景与目标

在现有 计划（目标+进度）/ 待办（可关联计划）/ 存款（计划+流水）/ 记账（支出）基础上：

1. **记账快捷关联（联动 C）**：记账时可选关联计划；计划页可查看该计划关联的支出合计；从计划页点"记一笔"自动带备注并关联计划
2. **自动生成月度存钱待办（联动 D）**：创建存款计划时可选"自动生成每月存钱待办"并设置每月提醒日；到期自动出现一条存钱待办，可跳转对应存款计划
3. **分级待办**：计划 = 第 0 层大待办，其下待办可嵌套最多三级（L1 → L2 → L3）；父待办不随子待办自动完成，但子待办全部完成时给出提示；上层节点可展开查看全部下层内容（树形展示）

## 二、范围与边界

**本期范围（Web 端）**：后端数据模型/接口扩展 + Web 前端界面改造。

**不做**：
- 待办完成时自动生成存款记录（后续可加）
- 支出自动推进计划进度（进度仍 = 待办完成率）
- 待办/计划共享协作（沿用个人模式）
- 微信小程序同步改造（二期）

## 三、数据模型（新迁移 003）

`backend/migrations/003_linkage_todos_plans.sql`：

```sql
-- 待办父子关系（分级，最多三级）
ALTER TABLE todos ADD COLUMN parent_id INTEGER REFERENCES todos(id) ON DELETE CASCADE;

-- 自动生成的存钱待办关联的存款计划
ALTER TABLE todos ADD COLUMN deposit_plan_id INTEGER REFERENCES deposit_plans(id) ON DELETE SET NULL;

-- 支出关联目标计划（联动 C）
ALTER TABLE expenses ADD COLUMN plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL;

-- 存款计划：每月自动生成存钱待办开关 + 提醒日
ALTER TABLE deposit_plans
    ADD COLUMN auto_todo_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN auto_todo_day INTEGER DEFAULT 28 CHECK (auto_todo_day BETWEEN 1 AND 28);

CREATE INDEX idx_todos_parent ON todos(parent_id);
CREATE INDEX idx_expenses_plan ON expenses(plan_id);
```

设计要点：

- `parent_id` 自引用；物理删除父待办时级联删除子待办；**逻辑删除时由接口递归软删全部子孙**
- `deposit_plan_id` 只由自动生成逻辑写入，普通创建/修改待办不允许设置
- 层级校验：计划=0 层，子待办最多到第 3 层（创建/修改时校验父节点深度 ≤ 2）

## 四、后端接口改动

### 待办（todos.rs）

- `CreateTodo` / `UpdateTodo` 增加 `parent_id`（更新用 `Option<Option<i32>>` 支持清空）
- 校验：`parent_id` 必须属于当前用户且未删除；层级深度（父链长度 + 1）不得超过 3
- `GET /api/todos?plan_id=X`：返回该计划的**全部子孙待办**（递归查询），供前端组装树
- `GET /api/todos`：先执行"月度存钱待办懒生成"，再返回列表
- 删除：递归软删子孙
- 自动生成规则（`ensure_monthly_deposit_todos`）：
  - 遍历当前用户 `auto_todo_enabled = true AND monthly_goal > 0` 的存款计划
  - 若该存款计划当前月份没有未删除待办（按 `deposit_plan_id` + 截止日期所在月份判断），则创建一条：
    - 标题：`本月存入 ¥<月目标> 到《<计划名>》`
    - 截止日期：`auto_todo_day`，超过当月天数则取当月最后一天
    - `deposit_plan_id` = 存款计划 id，`plan_id` = NULL
  - 旧月份待办保留作为历史，不覆盖

### 计划（plans.rs）

- `Plan` 结构增加 `expense_total: f64`（该计划下未删除支出的合计，读取时计算）
- 列表/详情返回 `expense_total`
- **进度统计口径调整**：原"计划进度 = 该计划下待办完成率"改为"计划进度 = 该计划**全部子孙待办**（含一/二/三级）完成数 ÷ 子孙待办总数"；父待办不自动完成，但其自身状态计入统计

### 记账（expenses.rs）

- `Expense` 结构增加 `plan_id: Option<i32>` 与 `plan_name: Option<String>`
- 创建/修改支持 `plan_id`（校验属于当前用户；更新用 `Option<Option<i32>>` 支持清空）
- 列表 LEFT JOIN plans 返回 `plan_name`

### 存款计划（deposits.rs）

- 创建/修改支持 `auto_todo_enabled`、`auto_todo_day`（校验 1-28）
- 列表返回两个新字段

### 工作台（workbench.rs）

- `summary` 读取待办前先执行 `ensure_monthly_deposit_todos`，保证自动生成的存钱待办出现在概览

## 五、前端界面改动

### 类型与服务层

- `types/api.ts`：`Todo` 增加 `parent_id`、`deposit_plan_id`；`Plan` 增加 `expense_total`；`Expense` 增加 `plan_id`、`plan_name`；`DepositPlan` 增加 `auto_todo_enabled`、`auto_todo_day`
- `todoApi` / `planApi` / `expenseApi` / `depositApi` 相应扩展参数
- 新增 `utils/todoTree.ts`：`buildTodoTree(todos)` 由扁平列表组装树（按 `parent_id`，无父级且带 `plan_id` 的为一级）

### 计划页（PlansPage）

- 计划卡片展示"关联支出 ¥X"
- 卡片可展开为**完整任务树**（最多 3 级，缩进 + 折叠），节点显示完成状态
- 卡片新增"记一笔"按钮 → `navigate('/expenses?plan_id=<id>&note=<计划名>')`

### 待办页（TodosPage）

- 按计划分组，树形展示（一级/二级/三级缩进）
- 父待办有子节点时显示折叠箭头；展开可看全部子孙
- 子待办全部完成 → 父待办行显示提示徽标"子待办已全部完成"（不自动勾选）
- 新增/编辑弹窗增加"上级待办"选择（同级计划下的待办，最多到二级）

### 记账页（ExpensePage / ExpenseForm / HistoryPanel）

- 表单增加"关联计划"下拉（可选）
- 从 URL 读取 `plan_id`/`note` 参数预填（来自计划页"记一笔"）
- 已记录列表显示计划标签（`plan_name`）

### 存款页（DepositPage / 弹窗）

- 新建/编辑存款计划弹窗增加：
  - 开关"自动生成每月存钱待办"
  - 开启后显示"每月提醒日"数字选择（1-28，默认 28）

### 工作台页（WorkbenchPage）

- 自动生成的存钱待办照常出现在"待办卡"；带存款计划标识的可点击跳转 `/deposits`

## 六、测试与验证

1. 迁移 003 应用到本地库
2. 后端 `cargo check` + 接口联调：
   - 层级：创建 L1 → L2 → L3 成功，L4 拒绝（422）；跨计划/他人父节点拒绝
   - 递归删除：删父待办 → 子孙全部软删
   - 自动生成：存款计划开开关后 `GET /api/todos` 出现当月待办；改提醒日、跨月逻辑
   - 联动 C：创建支出带 `plan_id` → 计划 `expense_total` 正确；列表带 `plan_name`
3. 前端 `tsc --noEmit` + `npm run build`
4. 浏览器端到端：建计划 → 建三级待办 → 完成子待办看到提示徽标 → 计划页展开树 → 记一笔（自动带备注）→ 计划页看到关联支出 → 存款计划开自动待办 → 待办页出现存钱待办 → 点击跳转存款页
5. 375/768/1280px 响应式复查新增界面

## 七、涉及文件清单

**后端**

- 新增：`backend/migrations/003_linkage_todos_plans.sql`
- 修改：`backend/src/handlers/todos.rs`、`plans.rs`、`expenses.rs`、`deposits.rs`、`workbench.rs`

**前端**

- 修改：`frontend/src/types/api.ts`
- 新增：`frontend/src/utils/todoTree.ts`
- 修改：`frontend/src/services/todoApi.ts`、`planApi.ts`、`expenseApi.ts`、`depositApi.ts`
- 修改：`frontend/src/pages/PlansPage.tsx`、`TodosPage.tsx`、`ExpensePage.tsx`、`DepositPage.tsx`、`WorkbenchPage.tsx`
- 修改：`frontend/src/components/ExpenseForm.tsx`、`HistoryPanel.tsx`、`DepositPlanCard.tsx`（如涉及）
