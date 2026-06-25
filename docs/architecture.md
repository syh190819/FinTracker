# FinTracker 架构文档

> 版本: v0.1.0 | 更新: 2026-06-26

---

## 一、系统架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        用户（浏览器）                         │
│               ┌─────────────────────────────┐               │
│               │     React SPA (端口 3000)     │               │
│               │  TypeScript + Ant Design     │               │
│               └────────────┬────────────────┘               │
│                            │ HTTP / JSON                    │
│                            ▼                                │
│               ┌─────────────────────────────┐               │
│               │   Rust Axum API (端口 8080)  │               │
│               │        JWT 鉴权中间件         │               │
│               │     ┌──────┬──────┬──────┐   │               │
│               │     │用户  │记账   │预算  │   │               │
│               │     ├──────┼──────┼──────┤   │               │
│               │     │存款  │共享   │统计  │   │               │
│               │     └──────┴──────┴──────┘   │               │
│               └────────────┬────────────────┘               │
│                            │ SQL                            │
│                            ▼                                │
│               ┌─────────────────────────────┐               │
│               │   PostgreSQL (端口 5432)     │               │
│               │    7 张表 + 逻辑删除         │               │
│               └─────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## 二、架构模式

### 前后端分离
- 前端（React SPA）和后端（Rust API）完全解耦
- 前端通过 HTTP/JSON 调用后端 API
- 开发时 Vite 代理转发 `/api` 请求到后端
- 部署时前端构建为静态文件，由后端或 CDN 托管

### 三层架构（后端）
```
路由层 (handlers/)     → 接收 HTTP 请求，参数校验
业务逻辑层 (handlers/)  → 处理业务规则
数据访问层 (db/)         → 通过 SQLx 与 PostgreSQL 交互
```

### 认证模式
- 无状态 JWT 认证（不依赖 session）
- 客户端存储 token（localStorage）
- 每次请求通过 `Authorization: Bearer <token>` 头发送
- 24 小时过期

## 三、模块划分

| 模块 | 后端文件 | 前端页面 | 功能 |
|:-----|:---------|:---------|:-----|
| 用户 | handlers/auth.rs | Login.tsx, Register.tsx | 注册、登录、改密码 |
| 记账 | handlers/expenses.rs | ExpensePage.tsx | 支出增删改查 |
| 品类 | handlers/categories.rs | CategoryManager.tsx | 品类管理 |
| 预算 | handlers/budgets.rs | BudgetPage.tsx | 月度预算设置 |
| 存款 | handlers/deposits.rs | DepositPage.tsx | 存款计划 + 存取 |
| 共享 | handlers/sharing.rs | SharingPage.tsx | 邀请码 + 范围管理 |
| 统计 | handlers/statistics.rs | StatisticsPage.tsx | 图表统计 |
| 导入导出 | handlers/import_export.rs | ToolbarActions.tsx | 复制/导入/导出 |

## 四、数据流向

### 正常请求
```
用户操作 → React 组件 → API 调用 (axios) → Rust 处理器
    → 参数校验 → JWT 鉴权 → SQLx 查询 → PostgreSQL
    → 返回 JSON → React 渲染 → 用户看到结果
```

### 共享数据请求
```
用户 A 查询支出
    → 查自己数据
    → 查 sharing 表找到共享伙伴 B
    → 检查 scope 是否包含 expenses
    → 如果包含，也查 B 的支出数据
    → 合并返回（标记每笔数据属于谁）
```

## 五、安全架构

```
┌─────────────────────────────────────────────┐
│ 第一层：传输安全                              │
│   开发环境: HTTP (localhost)                  │
│   生产环境: Cloudflare Tunnel → HTTPS         │
├─────────────────────────────────────────────┤
│ 第二层：认证安全                              │
│   JWT 令牌: 24 小时过期                      │
│   密码: bcrypt 哈希 (不可逆)                  │
├─────────────────────────────────────────────┤
│ 第三层：代码安全                              │
│   SQL 注入: SQLx 参数化查询（原生免疫）         │
│   XSS: React 默认转义 HTML                    │
├─────────────────────────────────────────────┤
│ 第四层：数据安全                              │
│   逻辑删除: deleted_at 字段，不物理删除         │
│   数据隔离: 只能操作自己或共享伙伴的数据         │
│   操作留痕: created_by / updated_by 记录人     │
└─────────────────────────────────────────────┘
```

## 六、部署架构（上线后）

```
用户 → Cloudflare CDN (免费 HTTPS)
     → Cloudflare Tunnel
     → 云服务器 (端口全关闭)
         → Rust 后端 (端口 8080)
             → PostgreSQL (端口 5432)
```

Cloudflare Tunnel 的优势：
- 自动 SSL 证书管理
- 不暴露服务器 IP
- 防御 DDoS
- 完全免费
