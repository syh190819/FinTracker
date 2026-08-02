# FinTracker 计划中心重构 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans 按任务实施。步骤用 `- [ ]` 追踪。

**Goal:** 按 `docs/superpowers/specs/2026-08-02-fintracker-plan-center-design.md` 完成计划中心重构。

**Architecture:** 统一 plans 表（plan_types 多标签）+ 收支含收入 + 存取流水并入计划 + 5 Tab + 工作台 FAB + 个人中心。

**Tech Stack:** Rust Axum + SQLx + PostgreSQL、React 19 + TS + Ant Design 6。

## Global Constraints

- `plan_types` 值域 {budget, deposit, todo}，非空；前后端注册表一致
- 金额输入一律普通输入框（`inputMode="decimal"`），不用 `InputNumber` 带加减按钮
- FAB 菜单中"新建计划"与其他快捷项视觉区分（独立分组 + 图标/底色差异）
- 旧数据必须迁移保留；迁移前 pg_dump 备份
- 验收：`cargo check`、`tsc --noEmit`、`npm run build`、curl/浏览器 E2E

---

### Task 1: 迁移 004（表结构 + 旧数据迁移）

**Files:** Create `backend/migrations/004_plan_center.sql`

- [ ] Step 1: 备份数据库 `pg_dump`
- [ ] Step 2: 编写迁移（plans 加列、expenses.type、deposit 合并 DO 块、外键重建、GIN 索引、旧 plans 标 todo）
- [ ] Step 3: 应用并核对数据（deposit 计划数量、流水归属、自动待办归属）
- [ ] Step 4: Commit

### Task 2: 后端计划 API（plans.rs）

- [ ] Step 1: `Plan` 结构 + `plan_types: Vec<String>`、`income_goal`、`expense_limit`、`monthly_goal`、`auto_todo_enabled`、`auto_todo_day`
- [ ] Step 2: 创建/修改支持类型多选与校验（值域、非空）；列表 `type` 筛选（数组含任一）
- [ ] Step 3: 返回类型统计：income_total、expense_total、balance
- [ ] Step 4: 存取流水端点 `GET/POST /api/plans/{id}/transactions`（从 deposits.rs 迁移），移除 `/api/deposit-plans/*`
- [ ] Step 5: cargo check + 联调
- [ ] Step 6: Commit

### Task 3: 后端收支（expenses.rs）+ 工作台 + 个人中心

- [ ] Step 1: `Expense.type`；创建/修改/筛选支持 type 与 plan_id
- [ ] Step 2: workbench summary 增加 `month_income`（month_total 语义调整）
- [ ] Step 3: 新增 `handlers/profile.rs`：`PUT /api/profile/username`、`PUT /api/profile/password`；注册路由
- [ ] Step 4: cargo check + 联调
- [ ] Step 5: Commit

### Task 4: 前端类型/服务/注册表

- [ ] Step 1: `types/api.ts`：Plan 加类型与预算/存款字段、Expense 加 type、Profile 请求类型
- [ ] Step 2: services 更新（planApi type 筛选、expenseApi type、depositApi → plans 交易接口）
- [ ] Step 3: 新增 `utils/planTypes.ts` 注册表（budget/deposit/todo：label/icon/color）
- [ ] Step 4: tsc
- [ ] Step 5: Commit

### Task 5: 前端五个 Tab + 导航

- [ ] Step 1: MainLayout 导航改为 工作台/计划/收支/存款/待办；统计与共享 Tab 移除
- [ ] Step 2: App 路由：/plans 独立计划页；/expenses 收支页；/todos 待办页；/deposits 存款页
- [ ] Step 3: 个人中心：用户菜单加 共享管理/修改用户名/修改密码；共享页保留路由但入口在菜单；MainLayout 加两个修改弹窗（用户名、密码）
- [ ] Step 4: tsc + 浏览器验证
- [ ] Step 5: Commit

### Task 6: 计划页（PlansPage）

- [ ] Step 1: 类型多选创建/编辑（标签样式）
- [ ] Step 2: 按类型分组/筛选；卡片显示对应区块（budget 双进度、deposit 操作与流水、todo 任务树）
- [ ] Step 3: tsc + 验证
- [ ] Step 4: Commit

### Task 7: 收支页（ExpensePage）+ 待办页 + 存款页

- [ ] Step 1: 收支页：收入/支出记录（类型切换）、金额普通输入框、关联计划下拉
- [ ] Step 2: 待办页：todo 型计划树 + 临时待办（沿用现有结构，筛选 todo 型计划）
- [ ] Step 3: 存款页：deposit 型计划列表 + 存取操作（金额普通输入框）
- [ ] Step 4: tsc + 验证
- [ ] Step 5: Commit

### Task 8: 工作台 + FAB + 统计并入

- [ ] Step 1: 工作台加入统计图表（原 StatisticsPage 组件迁入）
- [ ] Step 2: 右下角 FAB【+】：弹出菜单，**"新建计划"独立分组/强调样式**，其余为记收入/记支出/新增待办/存入存款；金额输入普通输入框
- [ ] Step 3: tsc + 验证
- [ ] Step 4: Commit

### Task 9: 端到端验收 + 推送

- [ ] Step 1: 迁移核对（旧数据保留、deposit 合并、流水归属）
- [ ] Step 2: 全接口回归（plans 类型筛选、收支 income/expense、存取、profile 改用户名密码、workbench）
- [ ] Step 3: `npm run build` + 浏览器 E2E（建组合计划、FAB 样式区分、金额输入框无加减按钮）
- [ ] Step 4: 清理测试数据、文档状态更新、Commit + Push
