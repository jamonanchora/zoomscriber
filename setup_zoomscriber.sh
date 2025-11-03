#!/usr/bin/env bash
set -euo pipefail

# =========================
# CONFIGURE THESE VALUES
# =========================
APP_NAME="zoomscriber"
APP_DIR="/opt/zoomscriber"
APP_REPO="git@github.com:YOUR_GITHUB_ORG_OR_USER/Zoomscriber.git"   # or https URL
APP_PORT="3000"
APP_DOMAIN="your-domain.example"                                     # DNS pointing to droplet public IP

# Zoom/OpenAI secrets
ZOOM_ACCOUNT_ID="replace-me"
ZOOM_CLIENT_ID="replace-me"
ZOOM_CLIENT_SECRET="replace-me"
ZOOM_WEBHOOK_SECRET="replace-me"   # or use ZOOM_VERIFICATION_TOKEN instead
OPENAI_API_KEY="replace-me"

# =========================
# System setup
# =========================
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get upgrade -y

# Basic tools
apt-get install -y git ufw curl

# Firewall
ufw allow OpenSSH
ufw allow http
ufw allow https
yes | ufw enable || true

# Node via NodeSource (Node 20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs build-essential

# PM2 global
npm i -g pm2

# Create app user and directory
id -u $APP_NAME >/dev/null 2>&1 || adduser --system --group --home $APP_DIR $APP_NAME
mkdir -p $APP_DIR
chown -R $APP_NAME:$APP_NAME $APP_DIR

# Optional: SSH deploy user setup (skip if cloning via https)
# Assumes you have already added the droplet's SSH key to GitHub or will use a deploy key.
# ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N "" || true
# echo "Add this public key to GitHub deploy keys:"; cat /root/.ssh/id_ed25519.pub

# =========================
# Clone and build app
# =========================
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u $APP_NAME git clone "$APP_REPO" "$APP_DIR"
else
  echo "Repo already exists at $APP_DIR, pulling latest..."
  pushd "$APP_DIR"
  sudo -u $APP_NAME git pull
  popd
fi

pushd "$APP_DIR"
sudo -u $APP_NAME npm ci
sudo -u $APP_NAME npm run build

# Write .env
cat >/etc/$APP_NAME.env <<EOF
PORT=$APP_PORT
ZOOM_ACCOUNT_ID=$ZOOM_ACCOUNT_ID
ZOOM_CLIENT_ID=$ZOOM_CLIENT_ID
ZOOM_CLIENT_SECRET=$ZOOM_CLIENT_SECRET
ZOOM_WEBHOOK_SECRET=$ZOOM_WEBHOOK_SECRET
OPENAI_API_KEY=$OPENAI_API_KEY
NODE_ENV=production
EOF
chmod 600 /etc/$APP_NAME.env

# PM2 ecosystem file
cat >$APP_DIR/ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [
    {
      name: 'zoomscriber',
      script: 'dist/server/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF
chown $APP_NAME:$APP_NAME $APP_DIR/ecosystem.config.cjs

# Start app with env file
# PM2 doesn't directly read /etc/*.env, so we export via a wrapper
cat >/usr/local/bin/$APP_NAME-env <<'EOF'
#!/usr/bin/env bash
set -a
source /etc/zoomscriber.env
set +a
exec pm2 start /opt/zoomscriber/ecosystem.config.cjs --env production
EOF
chmod +x /usr/local/bin/$APP_NAME-env

# Enable PM2 startup
sudo -u $APP_NAME pm2 start dist/server/index.js || true
sudo -u $APP_NAME pm2 delete all || true
$APP_NAME-env
pm2 save
pm2 startup systemd -u $APP_NAME --hp $APP_DIR | bash

popd

# =========================
# NGINX + Let's Encrypt
# =========================
apt-get install -y nginx

cat >/etc/nginx/sites-available/$APP_NAME <<EOF
server {
  listen 80;
  server_name $APP_DOMAIN;

  location / {
    proxy_pass http://127.0.0.1:$APP_PORT;
    proxy_http_version 1.1;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Host \$host;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \"upgrade\";
  }
}
EOF

ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/$APP_NAME
nginx -t
systemctl reload nginx

# Certbot
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "$APP_DOMAIN" --non-interactive --agree-tos -m "admin@$APP_DOMAIN" --redirect

systemctl reload nginx

echo "Deployment complete. Verify: https://$APP_DOMAIN/healthz"
echo "To view logs: sudo -u $APP_NAME pm2 logs"