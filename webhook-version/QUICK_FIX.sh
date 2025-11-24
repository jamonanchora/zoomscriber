#!/usr/bin/env bash
# Quick fix script to remove old chatbot files and ensure webhook version files are in place

cd /opt/zoomscriber

echo "Removing old chatbot files..."
rm -f server/services/zoomChatbotClient.ts
rm -f server/lib/ephemeralReply.ts

echo "Ensuring webhook version files are copied..."
# Copy webhook version files if they exist
if [ -d "webhook-version/server" ]; then
  cp -r webhook-version/server/services/* server/services/
  cp -r webhook-version/server/routes/* server/routes/
  cp -r webhook-version/server/lib/* server/lib/
  cp -r webhook-version/server/db/* server/db/
  cp webhook-version/server/config.ts server/config.ts
  cp webhook-version/server/index.ts server/index.ts
  echo "✓ Files copied"
else
  echo "⚠️  webhook-version/server directory not found"
fi

# Double-check old files are gone
rm -f server/services/zoomChatbotClient.ts
rm -f server/lib/ephemeralReply.ts

echo "✓ Cleanup complete. Try building again: npm run build"

