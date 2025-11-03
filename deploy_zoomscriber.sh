#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/zoomscriber"
SERVICE="zoomscriber"

pushd "$APP_DIR"
git fetch origin main --depth=1
git checkout main
git pull --ff-only origin main
npm ci
npm run build
popd

systemctl restart ${SERVICE}.service
sleep 2
systemctl --no-pager --full status ${SERVICE}.service || true
curl -fsS http://127.0.0.1:3000/healthz || true