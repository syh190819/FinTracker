# FinTracker 前端集成计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 localStorage 版前端改造为对接 Rust 后端的全栈应用，并补全统计页、共享页和登录注册页。

**架构:** React 19 + TypeScript + Ant Design + React Router + axios；后端通过 `/api` 代理调用 Rust Axum API，JWT 令牌认证，数据从 localStorage 迁移至 PostgreSQL。

**前置依赖:** 后端 `backend/src/` 已全部开发完成，PostgreSQL 数据库需运行、迁移已执行。

---

## Task 1: 创建 API 客户端层

**Files:**
- Create: `frontend/src/services/apiClient.ts`
- Create: `frontend/src/services/expenseApi.ts`
- Create: `frontend/src/services/budgetApi.ts`
- Create: `frontend/src/services/depositApi.ts`
- Create: `frontend/src/services/categoryApi.ts`
- Create: `frontend/src/services/statisticsApi.ts`
- Create: `frontend/src/services/sharingApi.ts`
- Create: `frontend/src/services/importExportApi.ts`

**Step 1: 创建 apiClient.ts**

axios 实例，baseURL 为 `/api`，请求拦截器自动附加 `Authorization: Bearer <token>`，响应拦截器处理 401 → 清除 token 并跳登录。

**Step 2: 创建各领域 API 模块**

每个模块导出 async 函数，封装对应后端的增删改查接口。

---

## Task 2: 创建认证系统

**Files:**
- Create: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`
- Create: `frontend/src/pages/RegisterPage.tsx`
- Modify: `frontend/src/main.tsx`

**Step 1: AuthContext**

React Context 提供 `user`, `token`, `login()`, `register()`, `logout()`，token 持久化到 localStorage。

**Step 2: LoginPage**

antd Form：用户名 + 密码输入，提交调用 AuthContext.login()，成功后跳转到首页。

**Step 3: RegisterPage**

antd Form：用户名 + 密码 + 确认密码，提交调用 AuthContext.register()，成功后跳转到首页。

**Step 4: 接入 main.tsx**

用 AuthProvider 包裹 App。

---

## Task 3: 创建路由系统 + 布局

**Files:**
- Create: `frontend/src/components/ProtectedRoute.tsx`
- Create: `frontend/src/layouts/MainLayout.tsx`
- Modify: `frontend/src/App.tsx`
- Delete (from App): tab-based page switching logic

**Step 1: ProtectedRoute**

检查 AuthContext 中是否有 token，无则 `<Navigate to="/login" />`。

**Step 2: MainLayout**

antd Layout：Header 含导航 Tab（记账/预算/存款/统计/共享 + 导入导出工具 + 用户名/退出），Content 区域 `<Outlet />`。

**Step 3: 修改 App.tsx**

替换为 `<BrowserRouter>` + `<Routes>`，路由：
- `/login` → LoginPage
- `/register` → RegisterPage
- `/` → ProtectedRoute → MainLayout → 默认 redirect 到 `/expenses`
- `/expenses` → ExpensePage
- `/budgets` → BudgetPage
- `/deposits` → DepositPage
- `/statistics` → StatisticsPage
- `/sharing` → SharingPage

---

## Task 4: 改造记账页面

**Files:**
- Modify: `frontend/src/pages/ExpensePage.tsx`
- Modify: `frontend/src/components/BudgetOverviewCard.tsx`
- Modify: `frontend/src/components/ExpenseForm.tsx`
- Modify: `frontend/src/components/HistoryPanel.tsx`

将 props 传入的 FinanceData 操作替换为调用 API 服务（expenseApi, categoryApi），数据改为通过 React Query 或 useEffect 从 API 拉取。

保留现有 UI 布局和交互，只改数据层。

---

## Task 5: 改造预算页面

**Files:**
- Modify: `frontend/src/pages/BudgetPage.tsx`
- Modify: `frontend/src/components/BudgetList.tsx`
- Modify: `frontend/src/components/CategoryManager.tsx`

将 props 传入的 budget/category 操作替换为调用 budgetApi 和 categoryApi。

---

## Task 6: 改造存款页面

**Files:**
- Modify: `frontend/src/pages/DepositPage.tsx`
- Modify: `frontend/src/components/DepositPlanCard.tsx`

将 props 传入的 deposit 操作替换为调用 depositApi。

---

## Task 7: 创建统计页面

**Files:**
- Create: `frontend/src/pages/StatisticsPage.tsx`
- Create: `frontend/src/components/ExpenseTrendChart.tsx`
- Create: `frontend/src/components/CategoryPieChart.tsx`
- Create: `frontend/src/components/BudgetVsActualChart.tsx`

使用 recharts 实现三个图表：月度趋势折线图、品类占比饼图、预算 vs 实际柱状图。

调用 statisticsApi 获取数据。

---

## Task 8: 创建共享页面

**Files:**
- Create: `frontend/src/pages/SharingPage.tsx`

调用 sharingApi，实现：生成邀请码、接受邀请、查看共享关系、修改范围、解除共享。

---

## Task 9: 改造工具栏

**Files:**
- Modify: `frontend/src/components/TabNavigation.tsx`（或迁移到 MainLayout）

导入导出功能进化为从后端获取数据后导出 / 导入后写入后端。保留 Excel 导入导出能力。

---

## Task 10: 错误处理与边界情况

**Files:**
- Create: `frontend/src/components/ErrorBoundary.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/services/apiClient.ts`

- 全局 ErrorBoundary
- 401 自动跳登录
- 加载态（Spin/Skeleton）
- 空态（Empty）
- 网络错误 Toast

---

## Task 11: 删除无用文件 + Git 提交

删除不再使用的 `frontend/src/utils/dataStore.ts`（或其核心逻辑移入 API 层后保留旧版兼容），保留 `frontend/src/utils/helpers.ts` 的工具函数。

提交所有变更。
