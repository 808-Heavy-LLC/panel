# panel

A network monitoring dashboard for a Ubiquiti UDM Pro Max, designed to run on a Raspberry Pi in Chromium kiosk mode.

Real-time WAN throughput (via SNMP), top client consumers, traffic categories (DPI), and gateway health, on one always-on screen.

## Architecture

Two npm workspaces:

- `server/` — Fastify + native `ws`. Polls the UDM, holds the canonical state, and pushes ticks over a WebSocket at `/ws`.
- `web/` — SvelteKit (static adapter, Svelte 5 runes) + Tailwind v4. A single-page HUD that renders the live stream.

In production the server serves the built web app from `/`. In dev, Vite runs on `:5173` and proxies `/api` and `/ws` to the server on `:4000`.

### Two UDM data sources, on purpose

- **SNMPv2c** drives the real-time WAN bandwidth chart. The legacy controller API caches WAN counters at ~30s, which is too slow for a live chart.
- **Legacy controller API** (local username/password) drives clients, DPI categories, and gateway stats. Per-client rates are computed from byte deltas at a 60s cadence — anything faster races the controller's ~30s cache.
- **Integration API key** alone works but is feature-limited: no DPI, no per-client rates. Local creds unlock those.

The server advertises which subsystems are live in `features` so the UI degrades gracefully when something is missing.

## Getting started

Requires Node 20+ and a UDM (or run in mock mode for laptop dev).

```bash
cp .env.example .env        # edit credentials
npm install
npm run dev                 # http://localhost:5173
```

Without `UDM_HOST` and credentials the server boots in **mock mode** with synthetic data, so the UI is fully exercisable on a laptop. Set `PANEL_MOCK=1` to force mock mode even with creds present.

### Configuration

All config is environment variables read from `.env` at the repo root. See [`.env.example`](./.env.example) for the full set. Highlights:

| Var | Purpose |
| --- | --- |
| `UDM_HOST` | UDM IP/hostname |
| `UDM_API_KEY` | Integration API key (clients, devices, current rates) |
| `UDM_USERNAME` / `UDM_PASSWORD` | Local admin (unlocks DPI + per-client rates) |
| `UDM_SNMP_COMMUNITY` | SNMPv2c community (enable on UDM under Settings → System → SNMP) |
| `UDM_WAN_IFINDEXES` | Comma-separated SNMP ifIndexes for WANs. Auto-detected if blank. |
| `UDM_WAN_LABELS` | Human-readable labels per WAN (matches index order) |
| `PANEL_MOCK` | `1` to force synthetic data |
| `PORT` | HTTP port (default `4000`) |

## Commands

```bash
npm run dev          # server + web in parallel (vite on 5173, server on 4000)
npm run build        # web → web/build, then server → server/dist
npm run start        # node server/dist/index.js (serves built web from /)
npm run typecheck    # both workspaces
```

There is no test suite. Typecheck is the only check.

## Themes

Three themes (`hud`, `cyberpunk`, `mission-control`) live in CSS custom properties under `[data-theme="…"]` in `web/src/app.css`. The current theme is persisted in `localStorage`.

Keyboard:

- `t` — cycle forward
- `Shift+t` — cycle backward
- `1`–`3` — jump to theme
- `?theme=cyberpunk` URL param overrides

To prevent kiosk LCD burn-in, `web/src/lib/burnInGuard.ts` drifts the UI by a few pixels every few minutes and rotates the active theme. New themes should match the animation cost of the others — heavy themes break the rotation.

## Deploying to a Pi

`deploy/install.sh` builds the project, installs a systemd unit, and starts the service. Run as the user that should own the service (it sudos as needed):

```bash
./deploy/install.sh
```

The installer prints the autostart snippets for Wayland (wayfire on Pi OS Bookworm) and X11 (LXDE). Both call `deploy/kiosk.sh`, which waits for `/api/health`, picks the right Ozone platform, and exec's Chromium in kiosk mode against `http://localhost:4000`.

Service management:

```bash
sudo systemctl status panel
journalctl -u panel -f
```

### Quieter fan (Pi 4B)

`deploy/tmpfiles-panel-fan.conf` raises the pwm-fan trip points to 60/65/70/75 °C — the stock 40/45/50/55 °C is too twitchy for an always-on kiosk. The `dtparam=fan_temp*` keys in `/boot/firmware/config.txt` don't take effect on Pi OS Trixie, so this is applied via `systemd-tmpfiles` at every boot:

```bash
sudo cp deploy/tmpfiles-panel-fan.conf /etc/tmpfiles.d/panel-fan.conf
sudo systemd-tmpfiles --create /etc/tmpfiles.d/panel-fan.conf
```

## API

- `GET /api/snapshot` — current full state.
- `GET /api/health` — `{ ok: true, ts }`.
- `WS /ws` — sends one `snapshot` message on connect, then `tick` messages on every poll.

Wire types are defined in `server/src/types.ts` and mirrored in `web/src/lib/types.ts` — there is no shared package, so changes need to land in both.
