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
# Remove old chatbot-related files that don't exist in webhook version
echo "Removing old chatbot client files..."
rm -f server/services/zoomChatbotClient.ts
rm -f server/lib/ephemeralReply.ts

# Copy server files (this will overwrite existing files)
echo "Copying new server files..."
# Copy each directory explicitly to ensure overwrites
cp -r webhook-version/server/services/* server/services/ || {
  echo "Error: Could not copy services directory"
  exit 1
}
cp -r webhook-version/server/routes/* server/routes/ || {
  echo "Error: Could not copy routes directory"
  exit 1
}
cp -r webhook-version/server/lib/* server/lib/ || {
  echo "Error: Could not copy lib directory"
  exit 1
}
cp -r webhook-version/server/db/* server/db/ || {
  echo "Error: Could not copy db directory"
  exit 1
}
cp webhook-version/server/config.ts server/config.ts || {
  echo "Error: Could not copy config.ts"
  exit 1
}
cp webhook-version/server/index.ts server/index.ts || {
  echo "Error: Could not copy index.ts"
  exit 1
}

# Verify old files are gone and new files exist
if [ -f "server/services/zoomChatbotClient.ts" ]; then
  echo "⚠️  Warning: zoomChatbotClient.ts still exists, removing..."
  rm -f server/services/zoomChatbotClient.ts
fi
if [ -f "server/lib/ephemeralReply.ts" ]; then
  echo "⚠️  Warning: ephemeralReply.ts still exists, removing..."
  rm -f server/lib/ephemeralReply.ts
fi

# Verify new webhook client exists
if [ ! -f "server/services/incomingWebhookClient.ts" ]; then
  echo "❌ Error: incomingWebhookClient.ts not found after copy!"
  exit 1
fi
echo "✓ Files copied successfully"

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

