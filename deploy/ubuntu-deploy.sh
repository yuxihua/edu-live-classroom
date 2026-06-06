#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www/edu-live-classroom
API_DIR="$APP_DIR/backend"
WEB_DIR="$APP_DIR/frontend"
NGINX_SITE=/etc/nginx/sites-available/edu-live-classroom

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root: sudo bash deploy/ubuntu-deploy.sh"
  exit 1
fi

echo "[1/8] Install system packages"
apt update
apt install -y nginx mysql-server curl git certbot python3-certbot-nginx

echo "[2/8] Install Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

if [[ ! -d "$APP_DIR" ]]; then
  echo "Project not found at $APP_DIR"
  echo "Please upload project to $APP_DIR first."
  exit 1
fi

echo "[3/8] Build frontend"
cd "$WEB_DIR"
npm install
npm run build

echo "[4/8] Install backend dependencies"
cd "$API_DIR"
npm install

if [[ ! -f "$API_DIR/.env" ]]; then
  cp "$API_DIR/.env.example" "$API_DIR/.env"
  echo "Created $API_DIR/.env, please edit DB and secrets before production use."
fi

echo "[5/8] Start backend with PM2"
pm2 delete edu-live-api >/dev/null 2>&1 || true
pm2 start src/server.js --name edu-live-api
pm2 save

if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root >/tmp/pm2_startup_cmd.txt || true
fi

echo "[6/8] Configure Nginx"
cp "$APP_DIR/deploy/nginx.conf" "$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/edu-live-classroom
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[7/8] Firewall"
ufw allow OpenSSH || true
ufw allow 80 || true
ufw allow 443 || true
ufw --force enable || true

echo "[8/8] Done"
echo "Optional HTTPS: certbot --nginx -d your-domain.com"
echo "Remember to import database/schema.sql into MySQL."
