#!/usr/bin/env bash
# Set up the KDE Plasma (Wayland) kiosk on a Raspberry Pi (Pi 5, Pi OS/Debian
# trixie). Turns a fresh Pi-desktop install into: SDDM autologin -> Plasma ->
# the panel Chromium kiosk fullscreen, with Ctrl+Alt+K (and a desktop icon) to
# toggle out to a full KDE desktop.
#
# Idempotent-ish: safe to re-run. Run as the kiosk user (NOT root); it sudos
# only where needed. Reboot afterwards so SDDM + a fresh Plasma session pick
# everything up.
#
# This replaces the old labwc/wayfire kiosk (deploy/kiosk-toggle.sh is the
# labwc-era toggle, kept only for that rollback path). Assumes the panel server
# (deploy/install.sh -> panel.service) is already installed and serving :4000.
set -euo pipefail

PANEL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PANEL_USER="${SUDO_USER:-$USER}"
USER_HOME="$(getent passwd "$PANEL_USER" | cut -d: -f6)"
DEPLOY="$PANEL_DIR/deploy"

echo "==> Plasma kiosk setup for user=$PANEL_USER dir=$PANEL_DIR"

# 1. Pin the libpulse family to Debian. Plasma pulls Debian's
#    libpulse-mainloop-glib0 (+b1), which needs libpulse0 at the exact Debian
#    version; Pi OS ships a +rpt1 rebuild of libpulse0 with no matching
#    mainloop-glib0, so without this pin apt can't resolve Plasma's deps.
echo "==> Pinning libpulse* to Debian origin"
sudo tee /etc/apt/preferences.d/99-libpulse-sync >/dev/null <<'EOF'
Package: libpulse0 libpulse-mainloop-glib0 libpulsedsp libpulse-dev
Pin: release o=Debian
Pin-Priority: 1001
EOF

# 2. Install Plasma (minimal) + SDDM. --allow-downgrades because the pin above
#    downgrades libpulse0 from the +rpt1 rebuild to Debian's +b1.
echo "==> Installing kde-plasma-desktop + sddm (this is large)"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --allow-downgrades \
  kde-plasma-desktop sddm

# 3. Switch the display manager to SDDM and autologin into Plasma (Wayland).
echo "==> Switching display manager to SDDM + autologin"
sudo systemctl disable lightdm >/dev/null 2>&1 || true
sudo systemctl enable sddm
echo "$(command -v sddm)" | sudo tee /etc/X11/default-display-manager >/dev/null
sudo install -d /etc/sddm.conf.d
sudo tee /etc/sddm.conf.d/autologin.conf >/dev/null <<EOF
[Autologin]
User=$PANEL_USER
Session=plasma.desktop
EOF

# 4. Autostart the kiosk after login. kiosk-respawn.sh keeps Chromium alive
#    across crashes; kiosk.sh wraps it in kde-inhibit so KDE never blanks or
#    locks the screen while the kiosk runs.
echo "==> Installing kiosk autostart"
install -d "$USER_HOME/.config/autostart"
sed "s#/home/mackerman/panel#$PANEL_DIR#g" "$DEPLOY/panel-kiosk.desktop" \
  > "$USER_HOME/.config/autostart/panel-kiosk.desktop"
chmod +x "$DEPLOY/kiosk-respawn.sh" "$DEPLOY/kiosk.sh" "$DEPLOY/panel-toggle.sh"

# 5. Install the toggle launcher: as an app (so a global shortcut can target
#    it) and as a clickable desktop icon.
echo "==> Installing toggle launcher (app + desktop icon)"
install -d "$USER_HOME/.local/share/applications" "$USER_HOME/Desktop"
sed "s#/home/mackerman/panel#$PANEL_DIR#g" "$DEPLOY/panel-kiosk-toggle.desktop" \
  > "$USER_HOME/.local/share/applications/panel-kiosk-toggle.desktop"
install -m755 "$USER_HOME/.local/share/applications/panel-kiosk-toggle.desktop" \
  "$USER_HOME/Desktop/panel-kiosk-toggle.desktop"

# 6. Bind Ctrl+Alt+K to the toggle and free it from KWin "Show Desktop"
#    (Show Desktop -> minimize is the wrong model for a fullscreen kiosk; it
#    pops back the instant another window opens). KWin owns global shortcuts on
#    Plasma 6 Wayland and reads this file at session start.
echo "==> Binding Ctrl+Alt+K -> kiosk toggle"
kwriteconfig6 --file kglobalshortcutsrc --group kwin --key "Show Desktop" \
  "Meta+D,Meta+D,Toggle Show Desktop"
kwriteconfig6 --file kglobalshortcutsrc --group services \
  --group "panel-kiosk-toggle.desktop" --key "_launch" "Ctrl+Alt+K"
kwriteconfig6 --file kglobalshortcutsrc --group services \
  --group "panel-kiosk-toggle.desktop" --key "_k_friendly_name" "Panel Kiosk"

# 7. Disable the KDE screen locker's autolock (belt-and-suspenders alongside
#    the kde-inhibit in kiosk.sh).
echo "==> Disabling screen auto-lock"
kwriteconfig6 --file kscreenlockerrc --group Daemon --key Autolock false
kwriteconfig6 --file kscreenlockerrc --group Daemon --key LockOnResume false

echo
echo "==> Done. Reboot to land in SDDM -> Plasma -> kiosk."
echo "    Ctrl+Alt+K (or the 'Panel Kiosk' desktop icon) toggles the kiosk."
echo "    Rollback DM: sudo systemctl disable sddm && sudo systemctl enable lightdm"
