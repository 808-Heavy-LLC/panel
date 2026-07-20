#!/usr/bin/env bash
# One-shot installer for panel on the Pi.
# Run as the user that should own the service (NOT root). Will sudo only when needed.
set -euo pipefail

PANEL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PANEL_USER="${SUDO_USER:-$USER}"

echo "==> Installing panel"
echo "    dir:  $PANEL_DIR"
echo "    user: $PANEL_USER"

# 1. Build
cd "$PANEL_DIR"
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example (edit it after install)"
  cp .env.example .env
fi

echo "==> npm install"
npm install
echo "==> npm run build"
npm run build

# 2. systemd service
SERVICE_FILE=/etc/systemd/system/panel.service
echo "==> Writing $SERVICE_FILE"
sudo sed \
  -e "s|__USER__|$PANEL_USER|g" \
  -e "s|__PANEL_DIR__|$PANEL_DIR|g" \
  "$PANEL_DIR/deploy/panel.service" | sudo tee "$SERVICE_FILE" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable panel.service
sudo systemctl restart panel.service

echo
echo "==> panel server installed and running."
echo "    status:   sudo systemctl status panel"
echo "    logs:     journalctl -u panel -f"
echo "    URL:      http://localhost:4000"
echo
echo "==> To run the kiosk display on KDE Plasma (current setup):"
echo "        $PANEL_DIR/deploy/install-plasma-kiosk.sh   # then reboot"
echo
echo "    That sets up SDDM autologin -> Plasma -> the Chromium kiosk, with"
echo "    Ctrl+Alt+K (and a desktop icon) to toggle out to the KDE desktop."
echo
echo "    Test the kiosk script directly with:"
echo "        $PANEL_DIR/deploy/kiosk.sh"
