# FinTracker 阿里云部署计划

> 日期：2026-08-02 | 状态：待购买服务器

## 一、现状与已定决策

| 事项 | 状态/决定 |
|:-----|:---------|
| 域名 | `luxiaohei.top`，阿里云云解析 DNS |
| 当前解析 | 指向 GitHub Pages（`shi-lu134.github.io`） |
| GitHub Pages 旧站 | **不再保留**，域名整个切换给 FinTracker |
| 服务器 | **尚未购买**，本计划就绪后按清单执行 |
| 部署工具包 | 已就绪：`deploy/` 目录（脚本 + Nginx + systemd 配置） |

## 二、部署架构

```
手机/电脑 ── HTTPS ──► luxiaohei.top (Nginx 443)
                          ├── /      → React 前端静态文件
                          └── /api/* → Rust 后端 (127.0.0.1:8080)
                                          └── PostgreSQL (localhost:5432)
```

## 三、执行清单（按顺序）

### 1. 购买服务器

- 阿里云**轻量应用服务器**，2C2G 40GB（约 24~34 元/月）
- 系统镜像：**Ubuntu 22.04**
- 地区二选一（见下方"速度说明"）：
  - **香港**：免备案，买完当天可用 → **推荐先选这个**
  - **大陆**：需 ICP 备案（1~2 周），备案通过前域名不能解析到大陆 IP

### 2. 放行端口

阿里云轻量控制台 → 防火墙，放行 `22`（SSH）、`80`、`443`。

### 3. 备案（仅大陆方案）

阿里云控制台 → 备案，按提示提交。香港方案跳过此步。

### 4. 修改 DNS 解析

云解析 DNS 控制台，把记录改为服务器公网 IP：

```
主机记录  类型  记录值
@        A     服务器公网IP
www      A     服务器公网IP
```

> 改完后先验证解析生效（`nslookup luxiaohei.top`），**再执行部署脚本**，否则 HTTPS 证书申请会失败。

### 5. 上传代码

```bash
scp -r backend frontend deploy docs root@服务器IP:/opt/fintracker/
```

### 6. 一键部署

```bash
ssh root@服务器IP
cd /opt/fintracker
DOMAIN=luxiaohei.top bash deploy/deploy.sh
```

脚本自动完成：装依赖 → 建库建表 → 构建前后端 → 注册服务 → 配 Nginx → 申请免费 HTTPS 证书。

### 7. 验证上线

- 浏览器打开 `https://luxiaohei.top` → 注册/登录/记账
- `curl https://luxiaohei.top/api/health` 返回 `OK`

### 8.（可选）接入微信小程序

`miniprogram/utils/constants.js` 中 `API_BASE_URL` 改为 `https://luxiaohei.top/api`，小程序后台配置 request 合法域名。

### 9. 日常维护

- 备份：服务器上加 cron 定时 `pg_dump`（脚本未内置）
- 更新：拉取最新代码后重新执行构建（`deploy/deploy.sh` 可重复执行）

## 四、速度说明（香港 vs 大陆）

- **香港服务器**：大陆访问延迟约 30~80ms，日常记账、网页浏览完全无感；优点是不用备案，买完当天上线。
- **大陆服务器**：延迟约 10~30ms，更快，但必须先完成 ICP 备案（1~2 周），未备案时 80/443 端口会被拦截。
- **建议路线**：先用香港跑起来 → 若日后需要更低延迟，再补备案并迁移到大陆节点（部署脚本可复用）。

## 五、参考资料

- `docs/deploy-aliyun.md` — 部署指南（架构图 + 分步说明）
- `deploy/deploy.sh` — 一键部署脚本
- `deploy/nginx-fintracker.conf` — Nginx 站点配置
- `deploy/fintracker.service` — 后端 systemd 服务
- `deploy/.env.production.example` — 生产环境变量模板
