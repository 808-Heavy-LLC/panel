#!/bin/sh
# Toggle the panel kiosk on/off under Plasma. Bound to Ctrl+Alt+K (via a
# kglobalshortcutsrc [services] launch entry) and also exposed as a desktop
# icon (panel-kiosk-toggle.desktop).
#
# Unlike KWin "Show Desktop" (which only minimizes — a fullscreen --kiosk
# window then pops back the moment another window opens), this fully stops the
# kiosk so the Plasma desktop is clean, and relaunches it on the next toggle.
#
# Killing the respawn wrapper too is what makes "off" stick; crashes (which
# leave the wrapper alive) still self-heal. See kiosk-respawn.sh / kiosk.sh.
DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"

if pgrep -f "[k]iosk-respawn.sh" >/dev/null 2>&1 || pgrep -f "chromium.*--kiosk" >/dev/null 2>&1; then
  # Kiosk is up -> tear it down, drop to the desktop.
  pkill -f "[k]iosk-respawn.sh" 2>/dev/null
  pkill -f "kde-inhibit --screenSaver" 2>/dev/null
  pkill -f "chromium.*--kiosk" 2>/dev/null
else
  # Kiosk is down -> relaunch it, detached so it survives this script exiting.
  setsid "$DIR/kiosk-respawn.sh" >/dev/null 2>&1 &
fi
