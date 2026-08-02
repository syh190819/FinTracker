# FinTracker 计划中心重构设计文档

> 日期：2026-08-02 | 状态：已确认，待实施

## 一、背景与目标

把"计划"升级为整个工作台的核心枢纽：收支（含收入）、存款、待办都围绕计划展开；计划用**多类型标签**（预算/存款/待办，可组合、可扩展）；各 Tab 既可以新建计划，也可以直接建临时小任务再选填关联计划。

## 二、核心模型

```
计划（统一表）
├── plan_types TEXT[]：类型标签（budget 预算 / deposit 存款 / todo 待办），可多选
├── 通用：name、deadline、archived、progress（手动兜底）、时间戳、deleted_at
├── budget 专属：income_goal（收入目标）、expense_limit（支出上限）
├── deposit 专属：monthly_goal、auto_todo_enabled、auto_todo_day
└── 关联（均选填）：收支记录 expenses.plan_id、存取流水 deposit_transactions.plan_id、待办 todos.plan_id
```

### 能力矩阵

| 类型 | 可关联 | 进度来源 |
|:-----|:-------|:---------|
| budget | 收支记录 | 收入达成率 + 支出占用率（双进度条） |
| deposit | 存取流水 | 余额 / 目标 |
| todo | 分级待办 | 待办完成率（全部子孙） |
| 组合 | 全部 | 各区块分别显示 |

### 扩展口子

- 数据库：`plan_types` 字符串数组，新类型零迁移
- 后端：`PLAN_TYPE_CONFIG` 注册表（类型名、可用字段、校验）
- 前端：`utils/planTypes.ts` 注册表（label、icon、color、开放功能区块）
- 新增计划类型 = 注册表加一行 + 新增关联功能，不动核心

## 三、数据模型改动（迁移 004，含旧数据迁移）

```sql
ALTER TABLE plans
    ADD COLUMN plan_types TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN income_goal DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN expense_limit DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN monthly_goal DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN auto_todo_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN auto_todo_day INTEGER DEFAULT 28 CHECK (auto_todo_day BETWEEN 1 AND 28);

ALTER TABLE expenses ADD COLUMN type VARCHAR(10) NOT NULL DEFAULT 'expense'
    CHECK (type IN ('expense','income'));
```

迁移步骤：

1. 备份数据库（pg_dump）
2. 现有 `deposit_plans` 逐条插入 `plans`（`plan_types = ARRAY['deposit']`，字段带入），记录新旧 id 映射
3. `deposit_transactions.plan_id` 与 `todos.deposit_plan_id` 改为映射后的新 plans.id（先删外键，更新后重建指向 plans）
4. 删除 `deposit_plans` 表
5. 现有 plans 补类型：`UPDATE plans SET plan_types = ARRAY['todo'] WHERE plan_types = '{}'`
6. `CREATE INDEX idx_plans_types ON plans USING GIN (plan_types)`

## 四、后端 API

### 计划

- `GET /api/plans?type=budget|deposit|todo`：按类型筛选（含任一标签）
- `POST /api/plans`：`name`、`deadline`、`plan_types`（非空，须在注册表内）、`income_goal`、`expense_limit`、`monthly_goal`、`auto_todo_enabled`、`auto_todo_day`
- `PUT /api/plans/{id}`：同字段可更新
- 返回结构附带类型统计：`income_total`、`expense_total`、`balance`、`done_count/total_count`（按需计算）

### 收支

- `expenses` 增加 `type`（expense/income）；`GET /api/expenses?type=` 筛选
- 创建/修改支持 `type` 与 `plan_id`
- 统计按收支分别汇总

### 存取流水（并入计划）

- `GET/POST /api/plans/{id}/transactions`（deposit/withdraw）
- 原 `/api/deposit-plans/*` 路由移除，前端迁移到新接口

### 个人中心

- `PUT /api/profile/username`：改用户名（唯一校验）
- `PUT /api/profile/password`：旧密码校验 + bcrypt 更新

### 工作台

- `GET /api/workbench/summary`：增加 `month_income`，保留 `month_expense`（原 month_total 语义拆分为收入/支出）

## 五、前端

### 导航（5 个 Tab）

`工作台 /`、`计划 /plans`、`收支 /expenses`、`存款 /deposits`、`待办 /todos`

- 统计页迁入工作台；共享从导航移除
- 个人中心：右上角用户菜单 → 共享管理、修改用户名、修改密码、退出登录

### 计划页

- 按类型分组/筛选；创建弹窗**类型多选**（标签样式）
- 计划卡片按类型显示区块：budget 双进度条（收入目标/支出上限）、deposit 存取操作、todo 任务树

### 收支页

- 收入/支出合并列表，类型可切换筛选；创建表单：类型、金额（**普通输入框 `inputMode="decimal"`，不用带加减按钮的数字控件**）、品类、日期、备注、关联计划（选填）

### 存款页

- 列出 type 含 deposit 的计划 + 存取操作（存入/取出）+ 流水

### 待办页

- type 含 todo 的计划（分级树）+ 临时待办

### 工作台

- 概览卡片 + **统计图表（原统计页）** + 右下角**悬浮 FAB【+】**：
  - 菜单内"**新建计划**"独立分组/强调样式，与"记收入/记支出/新增待办/存入存款"等其他快捷项做视觉区分
  - 金额输入一律普通输入框（无加减按钮）

## 六、不做（本期）

- 微信小程序同步（二期）
- 计划共享协作（个人使用）
- 新计划类型的实际业务（仅留扩展口子）

## 七、实施顺序

1. **阶段一**：迁移 004 + 旧数据迁移（备份 → 合并 → 校验）
2. **阶段二**：后端 API 重构（plans/expenses/transactions/profile/workbench）
3. **阶段三**：前端（类型注册表 → 计划/收支/存款/待办页 → 工作台+FAB → 个人中心）
4. **阶段四**：端到端验收（含旧数据核对、统计并入、FAB 样式、金额输入框）
