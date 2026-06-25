# FinTracker 测试文档

> 版本: v0.1.0 | 更新: 2026-06-26

---

## 一、测试策略总览

本项目的测试分为四层：

```
第四层：端到端测试 ─── 完整用户流程
    ↑
第三层：集成测试  ─── API 接口联调
    ↑
第二层：单元测试  ─── 单个函数/组件
    ↑
第一层：静态检查  ─── 编译时检查（Rust） + TypeScript 类型检查
```

## 二、第一层：静态检查（自动通过）

### Rust 编译检查
```bash
cd backend
cargo check
```
- Rust 编译器的类型系统会检查所有数据类型匹配
- SQLx 在编译时检查 SQL 语句语法（开启 compile-time checking）
- 不符合预期直接报编译错误，不会运行时崩溃

### TypeScript 类型检查
```bash
cd frontend
npx tsc --noEmit
```
- 所有 props、state、API 响应的类型都在编写时定义
- 类型不匹配在开发阶段直接报错

## 三、第二层：单元测试

### 后端单元测试（Rust）

测试范围：

| 测试对象 | 测试内容 |
|:---------|:---------|
| 用户模型 | 密码哈希验证、用户名校验 |
| JWT 工具 | 令牌生成、验证、过期检测 |
| 金额计算 | 每日预算计算、月度统计聚合 |
| 共享逻辑 | scope 校验、数据归属判断 |

测试文件位置：
```
backend/src/
├── models/user.rs          (含 #[cfg(test)] mod tests)
├── handlers/auth.rs        (含 #[cfg(test)] mod tests)
└── lib.rs                  (含工具函数测试)
```

运行方式：
```bash
cd backend
cargo test        # 运行所有单元测试
cargo test -- --nocapture  # 显示 println 输出
```

### 前端单元测试（Vitest）

测试范围：

| 测试对象 | 测试内容 |
|:---------|:---------|
| 工具函数 | 金额格式化、日期处理、分类统计 |
| API 封装 | 请求构建、响应解析、错误处理 |
| 状态管理 | 认证状态切换、数据缓存 |

运行方式：
```bash
cd frontend
npx vitest run   # 运行所有测试
npx vitest       # 监听模式（开发时持续运行）
```

## 四、第三层：API 集成测试

### 后端 API 测试（Rust）

每个 API 端点都需要覆盖以下场景：

```
正常流程：
  [POST]   /api/register    → 注册成功 → 返回用户 + token
  [POST]   /api/login       → 登录成功 → 返回 token
  [GET]    /api/expenses    → 获取列表 → 返回 200 + 数据数组
  [POST]   /api/expenses    → 创建记录 → 返回 201 + 记录
  [PUT]    /api/expenses/:id → 修改记录 → 返回 200 + 更新后数据
  [DELETE] /api/expenses/:id → 删除记录 → 返回 204
  [POST]   /api/share/invite → 生成邀请码 → 返回 200 + 邀请码
  [POST]   /api/share/accept → 接受邀请 → 返回 200

异常流程：
  401: 未提供 token 或 token 过期
  403: 试图操作不属于自己的数据
  404: 请求的资源不存在
  409: 用户名已存在 / 品类已存在
  422: 请求参数格式错误
```

运行方式：
```bash
cd backend
cargo test --test api_integration  # 集成测试（需要数据库）
```

### 前端 API 联调测试

通过开发代理验证前后端联调：
```bash
# 终端 1：启动后端
cd backend && cargo run

# 终端 2：启动前端
cd frontend && npm run dev

# 浏览器打开 http://localhost:3000
# 手动走一遍注册 → 登录 → 记账 → 设预算 → 存款 → 共享的完整流程
```

## 五、第四层：端到端验收测试

### 完整用户旅程

```
场景 1：新人注册
  打开页面 → 点击注册 → 输入用户名+密码 → 提交 → 自动登录 → 进入记账页

场景 2：日常记账
  填金额 → 选品类 → 写备注 → 点击记一笔 → 今日记录出现新条目

场景 3：设预算
  切换到预算页面 → 选品类 → 输入金额 → 保存 → 回到记账页看到进度条更新

场景 4：存款计划
  切换到存款页面 → 创建新计划 → 存入一笔 → 余额更新

场景 5：共享记账
  用户 A 生成邀请码 → 用户 B 注册 → B 输入邀请码 → B 确认同意
  → A 看到 B 的支出记录 → A 可以帮 B 记一笔
  → 每笔记录显示操作人

场景 6：数据导入导出
  记几笔账 → 点击复制数据 → 新设备粘贴导入 → 数据一致

场景 7：安全校验
  未登录无法访问任何页面 → 自动跳转登录页
  token 过期 → 自动跳转登录页
  删除操作 → 软删除，数据未真正丢失
```

### 验收清单

| 功能 | 验收标准 |
|:-----|:---------|
| 注册 | 用户名唯一性校验、密码不能为空 |
| 登录 | 用户名不存在提示、密码错误提示 |
| 记账 | 金额/品类必填、金额支持小数、负数不可用 |
| 预算 | 按天拆分计算正确、复制预算功能正常 |
| 存款 | 存入增加余额、取出减少余额、余额不能为负（取出时校验） |
| 共享 | 邀请码生成唯一、双向确认、范围勾选生效 |
| 统计 | 月度趋势正确、品类占比总和 100% |
| 导入导出 | JSON 导出可逆、Excel 字段完整 |
| 安全 | 未鉴权请求返回 401、跨用户数据不可访问 |

## 六、测试数据准备

### 种子数据
```sql
-- 两个测试用户
INSERT INTO users (username, password_hash) VALUES
  ('test_user_a', '$2b$10$...哈希值...'),
  ('test_user_b', '$2b$10$...哈希值...');

-- 测试品类
INSERT INTO categories (user_id, name) VALUES
  (1, '餐饮'), (1, '交通'), (1, '购物'),
  (2, '餐饮'), (2, '娱乐');

-- 测试支出
INSERT INTO expenses (user_id, amount, category, date, note, created_by) VALUES
  (1, 35.00, '餐饮', '2026-06-01', '午饭', 1),
  (1, 150.00, '交通', '2026-06-02', '打车', 1);

-- 测试预算
INSERT INTO budgets (user_id, month, category, amount) VALUES
  (1, '2026-06', '餐饮', 1500.00),
  (1, '2026-06', '交通', 500.00);
```

## 七、测试运行命令速查

```bash
# 后端所有测试
cd backend && cargo test

# 后端单个测试
cd backend && cargo test test_function_name

# 前端所有测试
cd frontend && npx vitest run

# 前端监听模式
cd frontend && npx vitest

# 类型检查
cd frontend && npx tsc --noEmit

# 完整手动测试
# 终端 1: cd backend && cargo run
# 终端 2: cd frontend && npm run dev
# 浏览器: http://localhost:3000
```
