# Deployment Guide - Webhook Version

## Option 1: Replace Existing Version (Recommended)

If you want to completely replace the old chatbot-based version with the webhook version:

### Steps:

1. **Backup your current setup** (optional but recommended):
   ```bash
   cd /opt/zoomscriber
   git stash  # or commit current changes
   ```

2. **Copy webhook-version files to root**:
   ```bash
   cd /opt/zoomscriber
   # Copy all files from webhook-version to root
   cp -r webhook-version/server/* server/
   cp webhook-version/package.json package.json
   cp webhook-version/tsconfig.json tsconfig.json
   ```

3. **Update environment variables** in `/etc/zoomscriber.env`:
   ```bash
   sudo nano /etc/zoomscriber.env
   ```
   
   Add these new variables:
   ```env
   # Incoming Webhook (REQUIRED for webhook version)
   ZOOM_WEBHOOK_ENDPOINT=https://integrations.zoom.us/chat/webhooks/incomingwebhook/...
   ZOOM_WEBHOOK_VERIFICATION_TOKEN=your_verification_token
   
   # Remove or comment out these (not needed for webhook version):
   # ZOOM_BOT_JID=...
   # ZOOM_ACCOUNT_ID=...
   ```

4. **Install dependencies and build**:
   ```bash
   cd /opt/zoomscriber
   npm ci
   npm run build
   ```

5. **Restart the service**:
   ```bash
   sudo systemctl restart zoomscriber.service
   sudo systemctl status zoomscriber.service
   ```

6. **Verify it's working**:
   ```bash
   curl http://127.0.0.1:3000/healthz
   ```

---

## Option 2: Run as Separate Service

If you want to keep both versions running (for testing):

1. **Create a new directory**:
   ```bash
   sudo mkdir -p /opt/zoomscriber-webhook
   sudo chown $USER:$USER /opt/zoomscriber-webhook
   ```

2. **Copy webhook-version there**:
   ```bash
   cp -r webhook-version/* /opt/zoomscriber-webhook/
   ```

3. **Create new environment file**:
   ```bash
   sudo nano /etc/zoomscriber-webhook.env
   ```
   (Include all the same variables as above)

4. **Create new systemd service**:
   ```bash
   sudo nano /etc/systemd/system/zoomscriber-webhook.service
   ```
   
   ```ini
   [Unit]
   Description=Zoomscriber Webhook Service
   After=network.target

   [Service]
   Type=simple
   EnvironmentFile=/etc/zoomscriber-webhook.env
   WorkingDirectory=/opt/zoomscriber-webhook
   ExecStart=/usr/bin/node dist/server/index.js
   Restart=always
   RestartSec=3
   LimitNOFILE=65535

   [Install]
   WantedBy=multi-user.target
   ```

5. **Enable and start**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable zoomscriber-webhook.service
   sudo systemctl start zoomscriber-webhook.service
   ```

---

## Quick Deploy Script (Option 1)

If you're already set up and just want to update:

```bash
cd /opt/zoomscriber
git pull
# Copy webhook-version files to root (if not already merged)
cp -r webhook-version/server/* server/ 2>/dev/null || true
cp webhook-version/package.json package.json
cp webhook-version/tsconfig.json tsconfig.json

# Update .env file with webhook variables (edit manually)
# sudo nano /etc/zoomscriber.env

npm ci
npm run build
sudo systemctl restart zoomscriber.service
```

---

## Important Notes

1. **Environment Variables**: Make sure to add `ZOOM_WEBHOOK_ENDPOINT` and `ZOOM_WEBHOOK_VERIFICATION_TOKEN` to your environment file.

2. **Systemd Service Path**: The service should run `node dist/server/index.js` (not `dist/index.js`). Check your service file:
   ```bash
   sudo cat /etc/systemd/system/zoomscriber.service
   ```
   
   If it says `ExecStart=/usr/bin/node dist/index.js`, update it to:
   ```bash
   sudo nano /etc/systemd/system/zoomscriber.service
   # Change to: ExecStart=/usr/bin/node dist/server/index.js
   sudo systemctl daemon-reload
   ```

3. **Database**: The webhook version uses the same database file (`zoomscriber.db`), so your OAuth tokens and account config will be preserved.

4. **Testing**: After deployment, test by:
   - Sending a voice note in Zoom
   - Reacting with ✏️ emoji
   - Check the webhook channel for the transcript

