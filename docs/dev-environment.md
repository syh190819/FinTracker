# FinTracker 本地开发环境

> 更新时间：2026-08-02。本文档记录本机已安装的开发环境与启动方式。

## 已安装的依赖

| 组件 | 版本 | 安装位置 |
|:-----|:-----|:---------|
| Node.js | 24.18.1 (LTS) | `%LOCALAPPDATA%\Programs\nodejs` |
| Rust | 1.97.1 (stable, GNU) | `%USERPROFILE%\.rustup` + `%USERPROFILE%\.cargo` |
| mingw-w64 | GCC 16.1.0 (UCRT) | `%LOCALAPPDATA%\Programs\mingw64` |
| PostgreSQL | 18.4 | `%LOCALAPPDATA%\Programs\PostgreSQL\18\pgsql` |
| PostgreSQL 数据目录 | — | `%LOCALAPPDATA%\PostgreSQL\data` |

> 说明：Rust 使用 GNU 工具链（配合 mingw 链接），cargo 已配置 rsproxy.cn 国内镜像加速依赖下载。

## 数据库

- 服务地址：`localhost:5432`
- 数据库名：`fintracker`
- 用户：`postgres`（trust 认证，无密码）
- 7 张表已通过 `backend/migrations/001_initial.sql` 创建

启动（非 Windows 服务，重启电脑后需重新启动）：

```powershell
& "$env:LOCALAPPDATA\Programs\PostgreSQL\18\pgsql\bin\pg_ctl.exe" -D "$env:LOCALAPPDATA\PostgreSQL\data" -l "$env:LOCALAPPDATA\PostgreSQL\pg.log" start
```

## 一键启动

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1
```

脚本会依次确保 PostgreSQL、后端（8080）、前端（3000）都在运行，重复执行不会重复启动。

## 手动启动（分步）

```powershell
# 1. 数据库（如已通过脚本启动则跳过）
# 2. 后端
cd D:\Repository\LULU\FinTracker\backend
cargo run          # http://localhost:8080

# 3. 前端（另开一个终端）
cd D:\Repository\LULU\FinTracker\frontend
npm run dev        # http://localhost:3000
```

## 验证

- 打开 http://localhost:3000 → 注册/登录 → 记账
- 后端健康检查：http://localhost:8080/api/health
- 前端通过 Vite 代理转发 `/api` 请求到后端，跨域无需额外配置

## 注意事项

- `backend/.env` 包含本地数据库连接与 JWT 密钥，已加入 `.gitignore`，不会被提交
- 前端 `node_modules` 已安装；如需重装依赖：`cd frontend && npm install`
