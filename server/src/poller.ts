import { config } from './config.js';
import { mockClients, mockDpi, mockUdm, mockWans } from './mock.js';
import { autoDetectWanInterfaces, SnmpClient, type SnmpInterface } from './snmp.js';
import { store } from './store.js';
import type { ClientStat, DpiCategory, UdmInfo, Wan } from './types.js';
import { UnifiClient } from './unifi.js';

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
    let lastUdm: UdmInfo | null = null;
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
        lastDpi = mockDpi();
      }
      if (now - udmAt >= config.poll.udmInfoMs) {
        udmAt = now;
        lastUdm = mockUdm();
      }
      store.pushTick({
        wans,
        clients: lastClients.length ? lastClients : undefined,
        dpi: lastDpi.length ? lastDpi : undefined,
        udm: lastUdm ?? undefined,
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

  let interfaces: SnmpInterface[] = [];
  try {
    interfaces = await snmpClient.listInterfaces();
    console.log(`[poller] SNMP discovered ${interfaces.length} interfaces`);
  } catch (err) {
    console.error('[poller] SNMP listInterfaces failed:', err);
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
  const wans: WanRuntime[] = wanIfaces.map((iface, i) => ({
    id: `wan${i + 1}`,
    ifIndex: iface.ifIndex,
    ifName: iface.ifName.match(/eth\d+$/)?.[0] ?? iface.ifName,
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

  // Cache per-WAN IPs from the legacy API; refresh occasionally.
  const wanIpsByIfName: Record<string, string | null> = {};
  let wanIpsAt = 0;
  async function refreshWanIps(): Promise<void> {
    if (!unifiOk) return;
    try {
      const ips = await unifi.getWanIps();
      for (const w of wans) {
        if (ips[w.ifName]) wanIpsByIfName[w.ifName] = ips[w.ifName] ?? null;
      }
    } catch (err) {
      console.error('[poller] wan ip refresh failed', err);
    }
  }

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
  let lastUdm: UdmInfo | null = null;
  let clientsAt = 0;
  let dpiAt = 0;
  let udmAt = 0;

  // === Tick: SNMP every wanMs, legacy stuff on slower cadences ===
  const tick = async (): Promise<void> => {
    const now = Date.now();

    // Refresh WAN IPs once a minute.
    if (snmpOk && now - wanIpsAt >= 60_000) {
      wanIpsAt = now;
      void refreshWanIps();
    }

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
          .getDpi()
          .then((d) => {
            lastDpi = d;
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
    }
    await Promise.all(tasks);

    const wanOut: Wan[] = wans.map((w) => ({
      id: w.id,
      ifIndex: w.ifIndex,
      ifName: w.ifName,
      label: w.label,
      speedBitsPerSec: w.speedBitsPerSec,
      rxBps: w.rxBps,
      txBps: w.txBps,
      rxTotal: w.rxTotal,
      txTotal: w.txTotal,
      wanIp: wanIpsByIfName[w.ifName] ?? null,
      status: 'ok',
      latencyMs: null,
    }));

    store.pushTick({
      wans: wanOut,
      clients: lastClients.length ? lastClients : undefined,
      dpi: lastDpi.length ? lastDpi : undefined,
      udm: lastUdm ?? undefined,
    });
  };

  await tick();
  setInterval(() => {
    void tick();
  }, config.poll.wanMs);
}
