# 微信小程序方案设计 —— FinTracker Mini

## 概述

基于 FinTracker 现有功能（Rust Axum + PostgreSQL），开发原生微信小程序前端，复用全部后端 API 和数据库，部署于腾讯云轻量服务器。

## 架构

```
[微信小程序] ──HTTPS──► [腾讯云 CVM]
                            │
                     Nginx (443)
                      ├── /api/* ──proxy──► Axum (8080)
                      └── / (静态) ───► React build
                            │
                     PostgreSQL (5432)
```

- **后端复用**：零代码改动，仅调整连接池大小
- **数据库复用**：同一套 7 张表，双端实时同步
- **认证复用**：同一套 JWT 密钥，token 互不冲突

## 配色（与 Web 端一致）

| 角色 | 值 |
|------|-----|
| 主色 | `#1a1a2e` |
| 强调色 | `#3a3a5c` |
| 页面背景 | `#fafbfc` |
| 卡片背景 | `#ffffff` |
| 正文 | `#1a1a2e` |
| 次要文本 | `#6b7280` |
| 边框 | `#e5e7eb` |
| 危险 | `#c0392b` |
| 成功 | `#1e8449` |

无蓝色、无彩色点缀，黑白灰极简风格。

## 项目结构

```
miniprogram/
├── app.json / app.js / app.wxss / project.config.json / sitemap.json
├── pages/
│   ├── login/ register/ expenses/ budgets/ deposits/ statistics/ sharing/
├── components/
│   └── nav-bar/ expense-form/ expense-item/ budget-card/ deposit-card/ empty-state/
├── utils/
│   └── api.js auth.js date.js constants.js
├── images/
└── styles/
    └── variables.wxss
```

## 页面交互

- **登录/注册**：简洁表单，微信头像一键填充
- **记账**（默认 Tab）：月总额 + 预算条 → 悬浮记一笔 → 按日期分组列表
- **预算**：按月滑动切换，品类进度条，编辑弹出数字键盘
- **存款**：卡片布局 + 进度环，点击进明细
- **统计**：折线图 / 饼图，按年过滤
- **共享**：邀请码 + 伙伴列表 + 范围开关

## 部署

- 腾讯云轻量 2C2G ~34 元/月
- Ubuntu 22.04 + Nginx + certbot + systemd
- Rust 二进制 < 10MB，PostgreSQL 共享 Web 端
