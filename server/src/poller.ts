import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { mockClients, mockDevices, mockDpi, mockHealth, mockUdm, mockWans } from './mock.js';
import { autoDetectWanInterfaces, SnmpClient, type SnmpInterface } from './snmp.js';
import { store } from './store.js';
import type { ClientStat, DpiCategory, HealthSubsystem, NetworkDevice, UdmInfo, Wan } from './types.js';
import { type GatewayWanDetails, UnifiClient } from './unifi.js';

/** Month-to-date counters per WAN, persisted across restarts.
 *
 *  The scheme is delta-based: each tick we compute `currentTotal - lastTotal`,
 *  add it to `monthRx/monthTx`, and update `lastTotal`. A negative delta
 *  (UDM/SNMP counter reset) is treated as 0. On month rollover the
 *  monthly bucket resets and `lastTotal` is re-seeded from the current
 *  total. This survives both UDM reboots and panel-server restarts. */
type MonthlyEntry = { lastRx: number; lastTx: number; monthRx: number; monthTx: number };
type MonthlyState = { month: string; wans: Record<string, MonthlyEntry> };

const MONTHLY_PATH = join(process.cwd(), 'data', 'monthly.json');
const MONTHLY_WRITE_INTERVAL_MS = 30_000;

function currentMonthLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function loadMonthlyState(): MonthlyState {
  try {
    const text = readFileSync(MONTHLY_PATH, 'utf8');
    const parsed = JSON.parse(text) as MonthlyState;
    if (parsed && typeof parsed.month === 'string' && parsed.wans) return parsed;
  } catch {
    // first run, missing file, or corrupt — fall through to fresh state
  }
  return { month: currentMonthLabel(), wans: {} };
}

function saveMonthlyState(state: MonthlyState): void {
  try {
    mkdirSync(dirname(MONTHLY_PATH), { recursive: true });
    writeFileSync(MONTHLY_PATH, JSON.stringify(state));
  } catch (err) {
    console.error('[poller] failed to persist monthly state:', err);
  }
}

type WanRuntime = {
  id: string;
  ifIndex: number;
  ifName: string;
  label: string;
  speedBitsPerSec: number;
  prevRx: number;
  prevTx: number;
  prevTs: number;
  rxTotal: number;
  txTotal: number;
  rxBps: number;
  txBps: number;
};

export async function startPoller(): Promise<void> {
  if (config.mock) {
    console.log('[poller] running in MOCK mode');
    store.setSource('mock');
    store.setFeatures({ dpiAvailable: true, perClientRates: true, snmpAvailable: true });
    let lastClients: ClientStat[] = [];
    let lastDpi: DpiCategory[] = [];
    let lastDpiCategories: DpiCategory[] = [];
    let lastUdm: UdmInfo | null = null;
    let lastDevices: NetworkDevice[] = [];
    let lastHealth: HealthSubsystem[] = [];
    let clientsAt = 0;
    let dpiAt = 0;
    let udmAt = 0;
    const tick = () => {
      const now = Date.now();
      const wans = mockWans(config.poll.wanMs);
      if (now - clientsAt >= config.poll.clientsMs) {
        clientsAt = now;
        lastClients = mockClients();
      }
      if (now - dpiAt >= config.poll.dpiMs) {
        dpiAt = now;
        const { apps, categories } = mockDpi();
        lastDpi = apps;
        lastDpiCategories = categories;
      }
      if (now - udmAt >= config.poll.udmInfoMs) {
        udmAt = now;
        lastUdm = mockUdm();
        lastDevices = mockDevices();
        lastHealth = mockHealth(wans);
      }
      store.pushTick({
        wans,
        clients: lastClients.length ? lastClients : undefined,
        dpi: lastDpi.length ? lastDpi : undefined,
        dpiCategories: lastDpiCategories.length ? lastDpiCategories : undefined,
        udm: lastUdm ?? undefined,
        devices: lastDevices.length ? lastDevices : undefined,
        health: lastHealth.length ? lastHealth : undefined,
      });
    };
    tick();
    setInterval(tick, config.poll.wanMs);
    return;
  }

  // === LIVE mode ===
  const unifi = new UnifiClient({
    host: config.udm.host,
    apiKey: config.udm.apiKey || undefined,
    username: config.udm.username || undefined,
    password: config.udm.password || undefined,
    site: config.udm.site,
    insecureTls: config.udm.insecureTls,
  });

  let unifiOk = false;
  try {
    await unifi.connect();
    unifiOk = true;
    console.log(`[poller] connected to UDM API at ${config.udm.host} (mode: ${unifi.getMode()})`);
  } catch (err) {
    console.error('[poller] UDM API connection failed:', err);
  }
  store.setSource('live');
  store.setFeatures({
    dpiAvailable: unifiOk && unifi.getMode() === 'legacy',
    perClientRates: unifiOk && unifi.getMode() === 'legacy',
    snmpAvailable: false,
  });

  // === SNMP setup ===
  const snmpClient = new SnmpClient({
    host: config.udm.host,
    community: config.snmp.community,
    port: config.snmp.port,
  });

  // Retry listInterfaces with backoff: a single transient genErr from the UDM
  // SNMP agent at startup must not leave the panel WAN-less until the next
  // service restart.
  let interfaces: SnmpInterface[] = [];
  const backoffsMs = [0, 1000, 2000, 5000, 10000];
  for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
    const delay = backoffsMs[attempt] ?? 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      interfaces = await snmpClient.listInterfaces();
      console.log(`[poller] SNMP discovered ${interfaces.length} interfaces`);
      break;
    } catch (err) {
      const last = attempt === backoffsMs.length - 1;
      console.error(
        `[poller] SNMP listInterfaces failed (attempt ${attempt + 1}/${backoffsMs.length})${last ? ' — giving up' : ', retrying'}:`,
        err,
      );
    }
  }

  let wanIfaces: SnmpInterface[] = [];
  if (config.snmp.wanIfIndexes.length > 0) {
    wanIfaces = config.snmp.wanIfIndexes
      .map((idx) => interfaces.find((i) => i.ifIndex === idx))
      .filter((i): i is SnmpInterface => !!i);
    console.log(
      `[poller] using configured WAN ifIndexes: ${wanIfaces.map((i) => `${i.ifIndex}=${i.ifName}`).join(', ')}`,
    );
  } else {
    wanIfaces = autoDetectWanInterfaces(interfaces);
    console.log(
      `[poller] auto-detected WAN interfaces: ${wanIfaces.map((i) => `${i.ifIndex}=${i.ifName}`).join(', ') || 'none'}`,
    );
  }

  const snmpOk = wanIfaces.length > 0;
  store.setFeatures({ snmpAvailable: snmpOk });

  // Build runtime WAN entries; label from env or fallback to "WAN N".
  // Prefer ifAlias (UDM sets it to "eth9"/"eth10") over the long ifDescr.
  const wans: WanRuntime[] = wanIfaces.map((iface, i) => ({
    id: `wan${i + 1}`,
    ifIndex: iface.ifIndex,
    ifName:
      iface.ifAlias ||
      iface.ifName.match(/eth\d+$/)?.[0] ||
      iface.ifName ||
      `if${iface.ifIndex}`,
    label: config.snmp.wanLabels[i] ?? `WAN ${i + 1}`,
    speedBitsPerSec: iface.ifHighSpeedMbps * 1_000_000,
    prevRx: 0,
    prevTx: 0,
    prevTs: 0,
    rxTotal: 0,
    txTotal: 0,
    rxBps: 0,
    txBps: 0,
  }));

  // Per-WAN public IP discovery is deferred — the legacy /stat/health only
  // exposes one entry without an ifname tying it to a specific interface.
  const wanIpsByIfName: Record<string, string | null> = {};

  // Monthly counter state: rebuilt from on-disk state at startup so a
  // panel-server restart doesn't lose month-to-date numbers.
  const monthly = loadMonthlyState();
  let monthlyDirty = false;
  let monthlySavedAt = 0;
  // Per-WAN gateway details (IPv6, latest WAN IP) refreshed on the
  // udmInfoMs cadence — lifetime byte counters from the gateway aren't
  // used for monthly tracking (SNMP is more frequent and authoritative).
  let lastWanDetails: GatewayWanDetails[] = [];

  // === Per-client rate computation (legacy API caches counters at ~30s, so
  //     we poll at 60s and derive rates from byte deltas). ===
  type Prev = { rxBytes: number; txBytes: number; ts: number };
  let prevByClient = new Map<string, Prev>();
  function deriveClientRates(input: ClientStat[]): ClientStat[] {
    const now = Date.now();
    const next = new Map<string, Prev>();
    const out = input.map((c) => {
      const key = c.id || c.mac;
      const prev = prevByClient.get(key);
      let rxBps = c.rxBps;
      let txBps = c.txBps;
      if (prev && now > prev.ts) {
        const dt = (now - prev.ts) / 1000;
        if (dt > 0 && dt < 600) {
          const drx = c.rxBytes - prev.rxBytes;
          const dtx = c.txBytes - prev.txBytes;
          if (drx >= 0) rxBps = drx / dt;
          if (dtx >= 0) txBps = dtx / dt;
        }
      }
      next.set(key, { rxBytes: c.rxBytes, txBytes: c.txBytes, ts: now });
      return { ...c, rxBps, txBps };
    });
    prevByClient = next;
    return out;
  }

  let lastClients: ClientStat[] = [];
  let lastDpi: DpiCategory[] = [];
  let lastDpiCategories: DpiCategory[] = [];
  let lastUdm: UdmInfo | null = null;
  let lastDevices: NetworkDevice[] = [];
  let lastHealth: HealthSubsystem[] = [];
  let clientsAt = 0;
  let dpiAt = 0;
  let udmAt = 0;

  // === Tick: SNMP every wanMs, legacy stuff on slower cadences ===
  const tick = async (): Promise<void> => {
    const now = Date.now();

    // SNMP: read counters, compute rates from previous reading.
    if (snmpOk) {
      try {
        const counters = await snmpClient.getCounters(wans.map((w) => w.ifIndex));
        for (const w of wans) {
          const c = counters.find((x) => x.ifIndex === w.ifIndex);
          if (!c) continue;
          if (w.prevTs > 0 && now > w.prevTs) {
            const dt = (now - w.prevTs) / 1000;
            if (dt > 0 && dt < 30) {
              const drx = c.rxOctets - w.prevRx;
              const dtx = c.txOctets - w.prevTx;
              if (drx >= 0) w.rxBps = drx / dt;
              if (dtx >= 0) w.txBps = dtx / dt;
            }
          }
          w.prevRx = c.rxOctets;
          w.prevTx = c.txOctets;
          w.prevTs = now;
          w.rxTotal = c.rxOctets;
          w.txTotal = c.txOctets;
        }
      } catch (err) {
        console.error('[poller] SNMP getCounters failed:', err);
      }
    }

    // Legacy: clients (slow poll due to UDM cache)
    const tasks: Promise<unknown>[] = [];
    if (unifiOk && now - clientsAt >= config.poll.clientsMs) {
      clientsAt = now;
      tasks.push(
        unifi
          .getClients()
          .then((c) => {
            lastClients = deriveClientRates(c);
          })
          .catch((e) => console.error('[poller] clients error', e)),
      );
    }
    if (unifiOk && now - dpiAt >= config.poll.dpiMs) {
      dpiAt = now;
      tasks.push(
        unifi
          .getTraffic()
          .then(({ apps, categories }) => {
            lastDpi = apps;
            lastDpiCategories = categories;
          })
          .catch((e) => console.error('[poller] dpi error', e)),
      );
    }
    if (unifiOk && now - udmAt >= config.poll.udmInfoMs) {
      udmAt = now;
      tasks.push(
        unifi
          .getUdmInfo()
          .then((u) => {
            if (u) lastUdm = u;
          })
          .catch((e) => console.error('[poller] udm info error', e)),
      );
      tasks.push(
        unifi
          .getDevices()
          .then((d) => {
            lastDevices = d;
          })
          .catch((e) => console.error('[poller] devices error', e)),
      );
      tasks.push(
        unifi
          .getHealth()
          .then((h) => {
            lastHealth = h;
          })
          .catch((e) => console.error('[poller] health error', e)),
      );
      tasks.push(
        unifi
          .getWanDetails()
          .then((d) => {
            lastWanDetails = d;
          })
          .catch((e) => console.error('[poller] wan details error', e)),
      );
    }
    await Promise.all(tasks);

    // Monthly accumulator: roll over on calendar-month change, then add
    // this tick's SNMP counter delta to monthRx/monthTx. Negative deltas
    // (counter reset on UDM reboot) are clamped to 0.
    const monthLabel = currentMonthLabel();
    if (monthly.month !== monthLabel) {
      monthly.month = monthLabel;
      monthly.wans = {};
      monthlyDirty = true;
    }
    if (snmpOk) {
      for (const w of wans) {
        const entry = monthly.wans[w.id] ?? { lastRx: 0, lastTx: 0, monthRx: 0, monthTx: 0 };
        const isFirstSeen = entry.lastRx === 0 && entry.lastTx === 0;
        if (!isFirstSeen) {
          const drx = w.rxTotal - entry.lastRx;
          const dtx = w.txTotal - entry.lastTx;
          if (drx > 0) entry.monthRx += drx;
          if (dtx > 0) entry.monthTx += dtx;
        }
        entry.lastRx = w.rxTotal;
        entry.lastTx = w.txTotal;
        monthly.wans[w.id] = entry;
        monthlyDirty = true;
      }
    }
    if (monthlyDirty && now - monthlySavedAt >= MONTHLY_WRITE_INTERVAL_MS) {
      saveMonthlyState(monthly);
      monthlySavedAt = now;
      monthlyDirty = false;
    }

    // /stat/health returns one entry per WAN (`wan`, `wan2`) plus a
    // `www` aggregate. Per-WAN latency lives in the bucket keyed by
    // WAN/WAN2 in `uptime_stats` (handled in unifi.ts → toHealthSubsystem).
    // Status comes from the wan-named subsystem; latency falls back to
    // the www entry when the wan-bucket isn't populated (fresh uplink).
    const wwwHealth = lastHealth.find((h) => h.name === 'www');
    const wanByOrder = lastHealth.filter((h) => h.name.startsWith('wan'));
    const detailsByIf = new Map(lastWanDetails.map((d) => [d.ifName, d]));
    const wanOut: Wan[] = wans.map((w, i) => {
      const det = detailsByIf.get(w.ifName) ?? null;
      const h = wanByOrder[i] ?? wanByOrder[0] ?? null;
      const monthEntry = monthly.wans[w.id];
      return {
        id: w.id,
        ifIndex: w.ifIndex,
        ifName: w.ifName,
        label: w.label,
        speedBitsPerSec: w.speedBitsPerSec,
        rxBps: w.rxBps,
        txBps: w.txBps,
        rxTotal: w.rxTotal,
        txTotal: w.txTotal,
        wanIp: det?.ip ?? wanIpsByIfName[w.ifName] ?? h?.wanIp ?? null,
        wanIpv6: det?.ipv6 ?? null,
        status: h?.status === 'ok' ? 'ok' : h ? 'down' : 'unknown',
        latencyMs: h?.latencyMs ?? wwwHealth?.latencyMs ?? null,
        monthRxBytes: monthEntry?.monthRx ?? 0,
        monthTxBytes: monthEntry?.monthTx ?? 0,
        monthLabel: monthly.month,
      };
    });

    store.pushTick({
      wans: wanOut,
      clients: lastClients.length ? lastClients : undefined,
      dpi: lastDpi.length ? lastDpi : undefined,
      dpiCategories: lastDpiCategories.length ? lastDpiCategories : undefined,
      udm: lastUdm ?? undefined,
      devices: lastDevices.length ? lastDevices : undefined,
      health: lastHealth.length ? lastHealth : undefined,
    });
  };

  await tick();
  setInterval(() => {
    void tick();
  }, config.poll.wanMs);
}
