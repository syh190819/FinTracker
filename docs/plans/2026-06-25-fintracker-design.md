# FinTracker 完整设计文档

> 基于原型 `finance_tracker.html` 孵化的 Web 记账应用
> 日期：2026-06-25

---

## 一、技术选型

| 层级 | 技术 | 说明 |
|:-----|:-----|:-----|
| 后端框架 | **Rust + Axum** | Tokio 官方出品，社区活跃，新手友好 |
| 前端框架 | **React + TypeScript** | TypeScript 提高代码安全性 |
| UI 组件库 | **Ant Design** | 中文文档友好，组件齐全 |
| 数据库 | **PostgreSQL** | 本机安装，开机自启 |
| 项目结构 | **Monorepo** | 前后端放一个仓库，管理方便 |
| 身份认证 | **JWT Token** | 24小时过期，无状态认证 |
| 密码加密 | **bcrypt** | 单向哈希，不可逆 |
| 传输安全 | 本地 HTTP / 上线 Cloudflare Tunnel (HTTPS) | |

---

## 二、功能清单

### 保留原型功能（3 Tab + 工具栏）

| 模块 | 子功能 |
|:-----|:--------|
| **记账** | 本月预算进度条 | 记一笔（金额 + 品类 + 日期 + 备注） | 已记录列表（按日期筛选） |
| **预算** | 设置月度预算（按月/按天拆分） | 复制预算到其他月份 | 品类管理（增删改 + 排除统计） | 预算列表折叠面板 |
| **存款** | 存款计划卡片（名称 + 路径 + 月目标 + 余额） | 存入/取出操作 | 拖拽排序 |
| **工具栏** | 复制数据（JSON） | 粘贴导入 | 导入Excel | 导出Excel |

### 新增功能

| 模块 | 子功能 |
|:-----|:--------|
| **用户系统** | 注册（用户名 + 密码） | 登录（JWT） | 修改密码 |
| **共享记账** | 生成邀请码 | 对方输入邀请码并同意（双向确认） | 可勾选共享范围（expenses/budgets/deposits） | 管理共享关系（查看/修改范围/解除） |
| **操作留痕** | 每条记录标记 `created_by`/`updated_by` | 谁什么时候做了什么 |
| **统计页面** | 月度总支出趋势图 | 品类占比图 | 预算 vs 实际对比图 | 月度/季度切换 |
| **逻辑删除** | 所有数据表增加 `deleted_at` 字段，软删除 |

---

## 三、数据库设计（7 张表）

### 表关系总览

```
users
 ├── categories       (user_id FK)      → 用户的消费品类
 ├── expenses         (user_id FK)      → 支出记录
 │   └── created_by / updated_by (FK)   → 操作人
 ├── budgets          (user_id FK)      → 月度预算
 ├── deposit_plans    (user_id FK)      → 存款计划
 │   └── deposit_transactions (plan_id FK) → 存取流水
 └── sharing          (user_a/b FK)     → 共享关系
```

### 各表字段

#### users — 用户
| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| id | serial PK | |
| username | varchar(50) UNIQUE | 用户名 |
| password_hash | varchar(255) | bcrypt 加密密码 |
| created_at | timestamp | 注册时间 |

#### categories — 消费品类
| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| id | serial PK | |
| user_id | integer FK | 属于哪个用户 |
| name | varchar(30) | 品类名（餐饮、交通等） |
| excluded | boolean | 是否排除统计 |
| sort_order | integer | 排序 |
| deleted_at | timestamp | 逻辑删除时间 |

#### expenses — 支出记录
| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| id | serial PK | |
| user_id | integer FK | 这笔账属于谁 |
| amount | decimal(12,2) | 金额 |
| category | varchar(30) | 消费品类 |
| date | date | 消费日期 |
| note | text | 备注 |
| created_by | integer FK | 创建人 |
| created_at | timestamp | 创建时间 |
| updated_by | integer FK | 最后修改人 |
| updated_at | timestamp | 最后修改时间 |
| deleted_at | timestamp | 逻辑删除时间 |

#### budgets — 月度预算
| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| id | serial PK | |
| user_id | integer FK | 属于谁 |
| month | varchar(7) | 月份，如 2026-06 |
| category | varchar(30) | 消费品类 |
| amount | decimal | 预算金额 |
| split_by_day | boolean | 是否按天拆分（代码计算每日预算） |
| deleted_at | timestamp | 逻辑删除时间 |

#### deposit_plans — 存款计划
| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| id | serial PK | |
| user_id | integer FK | 属于谁 |
| name | varchar(50) | 计划名称（旅行基金等） |
| category | varchar(30) | 理财类型（定期存款、基金等） |
| monthly_goal | decimal | 月目标 |
| sort_order | integer | 排序 |
| deleted_at | timestamp | 逻辑删除时间 |

#### deposit_transactions — 存取记录
| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| id | serial PK | |
| plan_id | integer FK | 关联存款计划 |
| type | varchar(10) | deposit / withdraw |
| amount | decimal | 金额 |
| date | date | 操作日期 |
| source | varchar(50) | 来源 |
| note | text | 备注 |
| created_by | integer FK | 操作人 |
| created_at | timestamp | 操作时间 |
| updated_by | integer FK | 最后修改人 |
| updated_at | timestamp | 最后修改时间 |
| deleted_at | timestamp | 逻辑删除时间 |

#### sharing — 共享关系
| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| id | serial PK | |
| user_a_id | integer FK | 邀请方 |
| user_b_id | integer FK | 被邀请方 |
| status | varchar(10) | active / revoked |
| invite_code | varchar(20) | 邀请码 |
| confirmed_by_b | boolean | 对方是否同意 |
| scope | jsonb | 共享范围，如 {"expenses":true,"budgets":true,"deposits":false} |
| created_at | timestamp | |

---

## 四、后端 API 接口

| 分组 | 方法 | 路径 | 说明 |
|:-----|:----|:-----|:-----|
| **用户** | POST | /api/register | 注册 |
| | POST | /api/login | 登录获取 JWT |
| | PUT | /api/profile/password | 修改密码 |
| **支出** | GET | /api/expenses | 查询支出列表 |
| | POST | /api/expenses | 记一笔 |
| | PUT | /api/expenses/:id | 修改 |
| | DELETE | /api/expenses/:id | 软删除 |
| **品类** | GET | /api/categories | 查询品类 |
| | POST | /api/categories | 新增品类 |
| | PUT | /api/categories/:id | 修改 |
| | DELETE | /api/categories/:id | 软删除 |
| **预算** | GET | /api/budgets | 查询预算 |
| | POST | /api/budgets | 设置预算 |
| | DELETE | /api/budgets/:id | 软删除 |
| **存款** | GET | /api/deposit-plans | 查计划列表 |
| | POST | /api/deposit-plans | 创建计划 |
| | PUT | /api/deposit-plans/:id | 修改计划 |
| | DELETE | /api/deposit-plans/:id | 软删除 |
| | POST | /api/deposit-plans/:id/transactions | 存/取操作 |
| **共享** | POST | /api/share/invite | 生成邀请码 |
| | POST | /api/share/accept | 接受邀请 |
| | GET | /api/share/relationships | 查共享关系 |
| | PUT | /api/share/:id/scope | 调整共享范围 |
| | DELETE | /api/share/:id | 解除共享 |
| **统计** | GET | /api/statistics/monthly | 月度统计 |
| | GET | /api/statistics/category | 品类统计 |
| **导入/导出** | GET | /api/export | 导出数据（JSON/Excel） |
| | POST | /api/import | 导入数据 |

---

## 五、前端页面规划

| 页面 | 路由 | 说明 |
|:-----|:-----|:-----|
| 登录 | /login | 用户名 + 密码 |
| 注册 | /register | 用户名 + 密码 + 确认密码 |
| 记账 | / | 本月预算进度条 + 记一笔 + 已记录 |
| 预算 | /budgets | 设置预算 + 品类管理 |
| 存款 | /deposits | 存款计划卡片 + 存取操作 |
| 统计 | /statistics | 月度趋势 + 品类占比 + 预算对比 |
| 共享 | /sharing | 生成邀请码 + 管理共享关系 |
| 设置 | /settings | 修改密码 |

### 导航结构

```
未登录：只显示 登录/注册
登录后：
[记账] [预算] [存款] [统计] [共享]  │ [复制数据] [粘贴导入] [导入Excel] [导出Excel] [头像▼]
```

---

## 六、安全设计

- **密码**：bcrypt 哈希存储，不可逆
- **认证**：JWT Token，24小时过期
- **SQL注入**：Rust SQLx 参数化查询，原生免疫
- **XSS**：React 自动转义 HTML
- **逻辑删除**：所有数据表 `deleted_at` 字段
- **共享权限**：API 层校验数据归属（自己或共享伙伴方可操作）
- **上线 SSL**：Cloudflare Tunnel 免费 HTTPS

---

## 七、项目目录结构（Monorepo）

```
FinTracker/
├── backend/                  # Rust Axum 后端
│   ├── src/
│   │   ├── main.rs           # 入口 + 路由注册
│   │   ├── models/           # 数据模型
│   │   ├── handlers/         # API 处理器
│   │   ├── middleware/       # JWT 鉴权中间件
│   │   └── db/               # 数据库连接 + 迁移
│   ├── migrations/           # SQL 迁移文件
│   ├── Cargo.toml
│   └── .env                  # 数据库连接配置
├── frontend/                 # React TypeScript 前端
│   ├── src/
│   │   ├── pages/            # 各页面组件
│   │   ├── components/       # 通用组件
│   │   ├── api/              # API 调用封装
│   │   ├── hooks/            # 自定义 hooks
│   │   └── App.tsx           # 路由配置
│   ├── package.json
│   └── tsconfig.json
├── docs/                     # 文档
│   └── plans/
└── README.md
```
