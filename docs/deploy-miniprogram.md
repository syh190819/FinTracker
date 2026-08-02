# FinTracker 小程序部署指南

## 前置条件

- 腾讯云轻量服务器 2C2G (Ubuntu 22.04) - ~34 元/月
- 已注册的微信小程序 AppID (去 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册)
- 一个域名（可选，也可用 IP，但小程序要求域名备案 + HTTPS）

## 步骤

### 1. 服务器环境准备

```bash
# SSH 登录服务器
ssh ubuntu@your-server-ip

# 安装基础软件
sudo apt update
sudo apt install -y nginx postgresql postgresql-client certbot python3-certbot-nginx

# 启动 PostgreSQL
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 创建数据库
sudo -u postgres createdb fintracker
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'your_password';"
```

### 2. 初始化数据库

```bash
# 从本地迁移文件导入
psql -h localhost -U postgres -d fintracker -f /path/to/001_initial.sql
```

### 3. 部署后端 (Rust Axum)

```bash
# 在本地构建
cd D:\Repository\FinTracker\backend
cargo build --release

# 上传二进制和 .env 到服务器
scp target/release/fintracker-backend ubuntu@your-server-ip:~/app/
scp .env ubuntu@your-server-ip:~/app/

# 服务器上创建 systemd 服务
sudo tee /etc/systemd/system/fintracker.service << 'EOF'
[Unit]
Description=FinTracker Backend
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/app
ExecStart=/home/ubuntu/app/fintracker-backend
Restart=on-failure
RestartSec=5
Environment=DATABASE_URL=postgresql://postgres:your_password@localhost:5432/fintracker
Environment=JWT_SECRET=fintracker-dev-secret-key-2026
Environment=SERVER_ADDR=0.0.0.0:8080

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable fintracker
sudo systemctl start fintracker
```

### 4. 部署前端 (React SPA 可选)

```bash
# 在本地构建
cd D:\Repository\FinTracker\frontend
npm run build

# 上传到服务器
scp -r dist/* ubuntu@your-server-ip:/var/www/fintracker/
```

### 5. 配置 Nginx + HTTPS

```bash
# 申请 SSL 证书 (如有域名)
sudo certbot --nginx -d your-domain.com

# 配置 Nginx
sudo tee /etc/nginx/sites-available/fintracker << 'EOF'
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Web 前端 (可选)
    root /var/www/fintracker;
    index index.html;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA 路由 fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
EOF

sudo ln -sf /etc/nginx/sites-available/fintracker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. 配置小程序

1. 打开 `miniprogram/utils/constants.js`，将 `API_BASE_URL` 改为你的域名：
   ```js
   const API_BASE_URL = 'https://your-domain.com/api';
   ```

2. 打开微信开发者工具，填入你的 AppID

3. **小程序管理后台 → 开发 → 开发设置 → 服务器域名** 中，添加 `https://your-domain.com` 到 request 合法域名

4. 用微信开发者工具打开 `miniprogram/` 目录，点击上传

5. 在微信小程序管理后台提交审核发布

## 验证

- 小程序首页应能正常加载登录页
- 注册账号、登录后能看到记账页面
- Web 端 (`https://your-domain.com`) 与小程序数据互通
