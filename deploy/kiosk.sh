#!/usr/bin/env bash
# Launch Chromium in kiosk mode pointing at the local panel server.
# Works on both Wayland (wayfire on Pi OS Bookworm) and X11.
set -euo pipefail

PANEL_URL="${PANEL_URL:-http://localhost:4000}"
PROFILE_DIR="${PANEL_KIOSK_PROFILE:-$HOME/.config/panel-kiosk}"

# Wait for the panel server to come up before opening the browser.
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "$PANEL_URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

mkdir -p "$PROFILE_DIR"

# Disable screen blanking on X11 (no-op on Wayland).
if command -v xset >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
  xset -dpms || true
  xset s off || true
  xset s noblank || true
fi

# Pick a Chromium binary.
for bin in chromium-browser chromium google-chrome; do
  if command -v "$bin" >/dev/null 2>&1; then
    BROWSER="$bin"
    break
  fi
done

if [ -z "${BROWSER:-}" ]; then
  echo "No Chromium binary found. Install with: sudo apt install chromium-browser" >&2
  exit 1
fi

# Pick the right Ozone platform. --ozone-platform-hint=auto isn't reliable on
# Debian's chromium build, so we force the matching backend explicitly.
PLATFORM_FLAG=""
if [ -n "${WAYLAND_DISPLAY:-}" ] || [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
  PLATFORM_FLAG="--ozone-platform=wayland"
elif [ -n "${DISPLAY:-}" ]; then
  PLATFORM_FLAG="--ozone-platform=x11"
fi

exec "$BROWSER" \
  --kiosk \
  $PLATFORM_FLAG \
  --enable-features=UseOzonePlatform \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --disable-features=TranslateUI \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --user-data-dir="$PROFILE_DIR" \
  --autoplay-policy=no-user-gesture-required \
  --disable-session-crashed-bubble \
  --disable-component-update \
  "$PANEL_URL"
