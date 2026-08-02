# FinTracker 阿里云部署指南

> 域名：luxiaohei.top（阿里云云解析 DNS）

## 部署架构

```
手机/电脑 ── HTTPS ──► luxiaohei.top (Nginx 443)
                          ├── /      → React 前端静态文件
                          └── /api/* → Rust 后端 (127.0.0.1:8080)
                                          └── PostgreSQL (localhost:5432)
```

## 一、准备服务器

- 阿里云轻量应用服务器，**2C2G 40GB** 起步即可
- 地区选择：
  - **香港/海外**：免备案，买完当天可用（推荐先这样跑起来）
  - **大陆**：必须先做 ICP 备案（阿里云控制台 → 备案，一般 1~2 周），否则 80/443 端口会被拦截
- 系统镜像：Ubuntu 22.04

## 二、域名解析（阿里云云解析 DNS）

把 `luxiaohei.top`（和 `www`）的 A 记录改为服务器公网 IP：

```
主机记录  类型  记录值
@        A     服务器公网IP
www      A     服务器公网IP
```

> 决定（2026-08-02）：**不再保留 GitHub Pages 旧站**，当前解析（185.199.111.153）直接替换为服务器公网 IP。

## 三、地区选择与速度

- **香港**：免备案，当天可用；大陆访问延迟约 30~80ms，日常使用无感，推荐先选
- **大陆**：延迟 10~30ms 更快，但必须先完成 ICP 备案（1~2 周）

完整执行清单见 `docs/plans/2026-08-02-deployment-plan.md`。

## 四、上传项目到服务器

```bash
scp -r backend frontend deploy docs root@服务器IP:/opt/fintracker/
```

## 五、一键部署

```bash
ssh root@服务器IP
cd /opt/fintracker
DOMAIN=luxiaohei.top bash deploy/deploy.sh
```

脚本会完成：安装 Nginx/PostgreSQL/Node/Rust → 建库建表 → 构建前后端 → 注册 systemd 服务 → 配置 Nginx → 申请免费 HTTPS 证书。

## 六、验证

- 浏览器访问 https://luxiaohei.top → 注册/登录 → 记账
- 健康检查：`curl https://luxiaohei.top/api/health`
- 微信小程序：把 `miniprogram/utils/constants.js` 的 `API_BASE_URL` 改为 `https://luxiaohei.top/api`

## 注意事项

- 生产 `JWT_SECRET` 与数据库密码由脚本自动生成，保存在服务器 `/opt/fintracker/backend/.env`
- 数据备份：定期 `pg_dump`（脚本未含备份任务，可按需添加 cron）
