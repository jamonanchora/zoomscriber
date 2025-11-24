#!/usr/bin/env bash
set -euo pipefail

# Deployment script for webhook version
# This assumes you're replacing the existing version

APP_DIR="/opt/zoomscriber"
SERVICE="zoomscriber"

echo "Deploying Zoomscriber Webhook Version..."

pushd "$APP_DIR"
echo "Fetching latest code..."
git fetch origin main --depth=1
git checkout main
git pull --ff-only origin main

echo "Copying webhook-version files..."
# Copy server files
cp -r webhook-version/server/* server/ || {
  echo "Warning: Could not copy webhook-version/server files. Make sure webhook-version exists."
  exit 1
}

# Copy config files
cp webhook-version/package.json package.json
cp webhook-version/tsconfig.json tsconfig.json

echo "Installing dependencies..."
npm ci

echo "Building..."
npm run build

echo "Checking systemd service path..."
# Check if service file needs updating
if grep -q "ExecStart.*dist/index.js" /etc/systemd/system/${SERVICE}.service 2>/dev/null; then
  echo "⚠️  Warning: Service file may need updating to use dist/server/index.js"
  echo "   Check: sudo cat /etc/systemd/system/${SERVICE}.service"
fi

popd

echo "Restarting service..."
systemctl restart ${SERVICE}.service
sleep 2
systemctl --no-pager --full status ${SERVICE}.service || true

echo "Health check..."
curl -fsS http://127.0.0.1:3000/healthz || {
  echo "⚠️  Health check failed. Check logs: sudo journalctl -u ${SERVICE} -n 50"
  exit 1
}

echo "✅ Deployment complete!"
echo ""
echo "⚠️  Don't forget to update /etc/${SERVICE}.env with:"
echo "   - ZOOM_WEBHOOK_ENDPOINT"
echo "   - ZOOM_WEBHOOK_VERIFICATION_TOKEN"
echo ""
echo "Then restart: sudo systemctl restart ${SERVICE}.service"

