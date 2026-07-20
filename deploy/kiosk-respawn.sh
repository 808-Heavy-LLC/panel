#!/bin/sh
# Compositor-agnostic respawn wrapper for the panel kiosk.
#
# Replaces `lwrespawn`, which loops only while `labwc` is running and is
# therefore a no-op under KWin/Plasma. This keeps the kiosk alive across
# Chromium crashes on any compositor: run kiosk.sh, and when it exits (crash
# or an explicit quit) wait briefly and relaunch, so the screen never stays
# blank.
#
# To "break out" to the desktop, MINIMIZE the kiosk window (Ctrl+Alt+K ->
# Show Desktop). Do not kill Chromium — that just makes this respawn it.
set -u
DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
while true; do
  "$DIR/kiosk.sh" || true
  sleep 2
done
