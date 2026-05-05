#!/usr/bin/env bash
# Toggle between the panel kiosk and the standard Pi labwc desktop
# (file manager + taskbar). Bound to Ctrl+Alt+K via ~/.config/labwc/rc.xml.
# Run only from inside the labwc Wayland session so child processes
# inherit WAYLAND_DISPLAY.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if pgrep -f "lwrespawn.*kiosk" >/dev/null 2>&1; then
  # Kiosk is up → tear it down, bring up the standard desktop.
  pkill -f "lwrespawn.*kiosk" || true
  pkill -f "chromium .*--kiosk" || true
  /usr/bin/lwrespawn /usr/bin/pcmanfm-pi </dev/null >/dev/null 2>&1 &
  /usr/bin/lwrespawn /usr/bin/wf-panel-pi </dev/null >/dev/null 2>&1 &
else
  # Desktop is up → tear it down, bring back the kiosk.
  pkill -f "lwrespawn.*pcmanfm-pi" || true
  pkill -f "lwrespawn.*wf-panel-pi" || true
  pkill -x pcmanfm-pi || true
  pkill -x wf-panel-pi || true
  /usr/bin/lwrespawn "$SCRIPT_DIR/kiosk.sh" </dev/null >/dev/null 2>&1 &
fi
