#!/usr/bin/env bash
set -euo pipefail

# =========================
# CONFIG — EDIT THESE
# =========================
APP_NAME="zoomscriber"
APP_DIR="/opt/zoomscriber"
APP_REPO="https://github.com/jamonanchora/zoomscriber.git"  # https is simplest on fresh servers
APP_BRANCH="main"
APP_DOMAIN="zoomscriber.jamonlyons.com"     # DNS must point to this server
APP_PORT="3000"

# Required secrets
ZOOM_CLIENT_ID="replace-me"
ZOOM_CLIENT_SECRET="replace-me"
ZOOM_WEBHOOK_SECRET="replace-me"     # or set ZOOM_VERIFICATION_TOKEN instead
OPENAI_API_KEY="replace-me"

# Contact email for Let's Encrypt
LETSENCRYPT_EMAIL="admin@your-domain.example"

# =========================
# System prep (root-only)
# =========================
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get upgrade -y
apt-get install -y git curl ufw ca-certificates gnupg lsb-release ffmpeg

# Firewall
ufw allow OpenSSH || true
ufw allow http || true
ufw allow https || true
yes | ufw enable || true

# Node.js 20 LTS (NodeSource)
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs build-essential
fi
node -v
npm -v

# PM2 global (optional but handy even with systemd)
npm i -g pm2

# =========================
# Clone or update app
# =========================
if [ ! -d "$APP_DIR" ]; then
  mkdir -p "$APP_DIR"
fi

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$APP_BRANCH" "$APP_REPO" "$APP_DIR"
else
  pushd "$APP_DIR"
  git fetch origin "$APP_BRANCH" --depth=1
  git checkout "$APP_BRANCH"
  git pull --ff-only origin "$APP_BRANCH"
  popd
fi

# =========================
# Build app
# =========================
pushd "$APP_DIR"
# Clean install
npm ci
npm run build
popd

# =========================
# Environment file
# =========================
cat >/etc/${APP_NAME}.env <<EOF
PORT=${APP_PORT}
NODE_ENV=production
APP_BASE_URL=https://${APP_DOMAIN}

ZOOM_CLIENT_ID=${ZOOM_CLIENT_ID}
ZOOM_CLIENT_SECRET=${ZOOM_CLIENT_SECRET}
ZOOM_REDIRECT_URI=https://${APP_DOMAIN}/oauth/callback
ZOOM_BOT_JID=${ZOOM_BOT_JID:-}
ZOOM_WEBHOOK_SECRET=${ZOOM_WEBHOOK_SECRET}
# ZOOM_VERIFICATION_TOKEN=optional_legacy

OPENAI_API_KEY=${OPENAI_API_KEY}
EOF
chmod 600 /etc/${APP_NAME}.env

# =========================
# systemd service
# =========================
cat >/etc/systemd/system/${APP_NAME}.service <<EOF
[Unit]
Description=Zoomscriber Service
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/${APP_NAME}.env
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3
# Increase if handling large uploads
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${APP_NAME}.service
systemctl restart ${APP_NAME}.service
sleep 2
systemctl --no-pager --full status ${APP_NAME}.service || true

# =========================
# NGINX + TLS (Let's Encrypt)
# =========================
apt-get install -y nginx
cat >/etc/nginx/sites-available/${APP_NAME} <<EOF
server {
  listen 80;
  server_name ${APP_DOMAIN};

  # Redirect to HTTPS (enabled after cert issuance)
  location / {
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Host \$host;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF

ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
nginx -t
systemctl reload nginx

# Certbot
apt-get install -y certbot python3-certbot-nginx
# Issue and enable HTTPS redirect automatically
certbot --nginx -d "${APP_DOMAIN}" --non-interactive --agree-tos -m "${LETSENCRYPT_EMAIL}" --redirect || true
systemctl reload nginx

# =========================
# Health check
# =========================
echo "Waiting for app to boot..."
sleep 3
set +e
curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" || true
curl -fsS "https://${APP_DOMAIN}/healthz" || true
set -e

echo
echo "Done. App should be reachable at: https://${APP_DOMAIN}/healthz"
echo "Manage service with: systemctl status|restart|logs ${APP_NAME}"