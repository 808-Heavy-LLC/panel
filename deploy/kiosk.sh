#!/usr/bin/env bash
# Launch Chromium in kiosk mode pointing at the local panel server.
# Works on both Wayland (wayfire on Pi OS Bookworm) and X11.
set -euo pipefail

PANEL_URL="${PANEL_URL:-http://localhost:4000}"
# URL the browser actually opens — page reads ?kiosk=1 to hide the cursor.
PANEL_KIOSK_URL="${PANEL_URL%/}/?kiosk=1"
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

# Force X11/XWayland even on Wayland sessions: Chromium-on-Wayland doesn't
# honor CSS `cursor: none`, and `unclutter` (X11/XFixes) is the reliable
# cursor-hider. labwc starts XWayland so DISPLAY=:0 is available.
export DISPLAY="${DISPLAY:-:0}"
PLATFORM_FLAG="--ozone-platform=x11"

# Hide the X cursor immediately (idle=0).
if command -v unclutter >/dev/null 2>&1; then
  pkill -x unclutter 2>/dev/null || true
  unclutter -idle 0 -root &
fi

# Keep the screen awake and unlocked for as long as the kiosk runs. Under
# Plasma/KWin the compositor (not `xset`) owns screen blanking and the KDE
# screen locker, so hold a KDE inhibit for both. kde-inhibit runs Chromium as
# its child and releases the inhibit only when Chromium exits. On non-KDE
# sessions (e.g. the labwc rollback path) kde-inhibit is absent, so fall back
# to launching the browser directly and rely on the xset calls above.
INHIBIT=""
if command -v kde-inhibit >/dev/null 2>&1; then
  INHIBIT="kde-inhibit --screenSaver --power"
fi

exec $INHIBIT "$BROWSER" \
  --kiosk \
  $PLATFORM_FLAG \
  --enable-features=UseOzonePlatform \
  --password-store=basic \
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
  "$PANEL_KIOSK_URL"
