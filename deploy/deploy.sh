#!/usr/bin/env bash
# FinTracker 一键部署脚本（Ubuntu 22.04 / Debian 12）
# 用法: sudo bash deploy.sh
# 前置: 仓库已上传到 /opt/fintracker（含 backend/ frontend/ deploy/）
set -euo pipefail

DOMAIN="${DOMAIN:-luxiaohei.top}"
APP_DIR="/opt/fintracker"
APP_USER="fintracker"
DB_NAME="fintracker"
DB_PASSWORD="${DB_PASSWORD:-fintracker-prod-password}"

echo "==> [1/7] 安装系统依赖"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx postgresql postgresql-client curl ca-certificates

echo "==> [2/7] 创建应用用户与目录"
id -u "$APP_USER" &>/dev/null || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR/frontend/dist" "$APP_DIR/backend"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "==> [3/7] 配置 PostgreSQL"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$APP_USER'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE USER $APP_USER WITH PASSWORD '$DB_PASSWORD';"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb -O "$APP_USER" "$DB_NAME"
fi
for f in "$APP_DIR/backend/migrations/"*.sql; do
  echo "  applying $(basename "$f")"
  sudo -u postgres psql -d "$DB_NAME" -f "$f" >/dev/null
done

echo "==> [4/7] 安装 Node.js 24 + Rust（用于构建）"
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 24 ]; then
  curl -fsSL https://nodejs.org/dist/v24.18.1/node-v24.18.1-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1
fi
if ! command -v cargo &>/dev/null; then
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
  mkdir -p "$HOME/.cargo"
  cat >> "$HOME/.cargo/config.toml" <<'EOF'
[source.crates-io]
replace-with = 'rsproxy-sparse'
[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"
EOF
fi

echo "==> [5/7] 构建前端与后端"
cd "$APP_DIR/frontend"
if [ -d node_modules ]; then npm ci --no-audit --no-fund; fi
npm install --no-audit --no-fund
npm run build
chown -R "$APP_USER":"$APP_USER" dist

cd "$APP_DIR/backend"
export PATH="$HOME/.cargo/bin:$PATH"
export DATABASE_URL="postgresql://$APP_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
cargo build --release
install -m 755 target/release/fintracker-backend "$APP_DIR/backend/fintracker-backend"

cat > "$APP_DIR/backend/.env" <<EOF
DATABASE_URL=postgresql://$APP_USER:$DB_PASSWORD@localhost:5432/$DB_NAME
JWT_SECRET=${JWT_SECRET:-$(openssl rand -hex 32)}
SERVER_ADDR=127.0.0.1:8080
EOF
chown "$APP_USER":"$APP_USER" "$APP_DIR/backend/.env"

echo "==> [6/7] 配置 systemd 服务"
install -m 644 "$APP_DIR/deploy/fintracker.service" /etc/systemd/system/fintracker.service
systemctl daemon-reload
systemctl enable --now fintracker

echo "==> [7/7] 配置 Nginx + HTTPS"
sed "s/luxiaohei.top/$DOMAIN/g" "$APP_DIR/deploy/nginx-fintracker.conf" > /etc/nginx/sites-available/fintracker
ln -sf /etc/nginx/sites-available/fintracker /etc/nginx/sites-enabled/fintracker
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if command -v certbot &>/dev/null || apt-get install -y -qq certbot python3-certbot-nginx; then
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect || \
    echo "certbot 申请证书失败，可稍后手动执行: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

echo ""
echo "部署完成！访问 https://$DOMAIN （若未配证书则 http://$DOMAIN）"
echo "验证: curl https://$DOMAIN/api/health"
