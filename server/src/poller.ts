import { config } from './config.js';
import { mockClients, mockDpi, mockUdm, mockWan } from './mock.js';
import { store } from './store.js';
import type { ClientStat, DpiCategory, UdmInfo, WanStats } from './types.js';
import { UnifiClient } from './unifi.js';

type Source = {
  getWan(): Promise<WanStats>;
  getClients(): Promise<ClientStat[]>;
  getDpi(): Promise<DpiCategory[]>;
  getUdm(): Promise<UdmInfo | null>;
};

function mockSource(): Source {
  return {
    async getWan() {
      return mockWan(config.poll.wanMs);
    },
    async getClients() {
      return mockClients();
    },
    async getDpi() {
      return mockDpi();
    },
    async getUdm() {
      return mockUdm();
    },
  };
}

function liveSource(client: UnifiClient): Source {
  return {
    getWan: () => client.getWan(),
    getClients: () => client.getClients(),
    getDpi: () => client.getDpi(),
    getUdm: () => client.getUdmInfo(),
  };
}

export async function startPoller(): Promise<void> {
  let source: Source;

  if (config.mock) {
    console.log('[poller] running in MOCK mode');
    source = mockSource();
    store.setSource('mock');
    store.setFeatures({ dpiAvailable: true, perClientRates: true });
  } else {
    const client = new UnifiClient({
      host: config.udm.host,
      apiKey: config.udm.apiKey || undefined,
      username: config.udm.username || undefined,
      password: config.udm.password || undefined,
      site: config.udm.site,
      insecureTls: config.udm.insecureTls,
    });
    try {
      await client.connect();
      console.log(`[poller] connected to UDM at ${config.udm.host} (mode: ${client.getMode()})`);
      source = liveSource(client);
      store.setSource('live');
      store.setFeatures({
        dpiAvailable: client.getMode() === 'legacy',
        perClientRates: client.getMode() === 'legacy',
      });
    } catch (err) {
      console.error('[poller] UDM connection failed, falling back to mock:', err);
      source = mockSource();
      store.setSource('mock');
      store.setFeatures({ dpiAvailable: true, perClientRates: true });
    }
  }

  let lastClients: ClientStat[] = [];
  let lastDpi: DpiCategory[] = [];
  let lastUdm: UdmInfo | null = null;
  let clientsAt = 0;
  let dpiAt = 0;
  let udmAt = 0;

  // UDM's per-client rate fields (rx_bytes-r/tx_bytes-r) are unreliable —
  // they return 0 for most clients on real hardware. Compute rates ourselves
  // from successive byte totals.
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

  const tick = async (): Promise<void> => {
    const now = Date.now();
    try {
      const wan = await source.getWan();

      const tasks: Promise<unknown>[] = [];
      if (now - clientsAt >= config.poll.clientsMs) {
        clientsAt = now;
        tasks.push(
          source
            .getClients()
            .then((c) => {
              lastClients = config.mock ? c : deriveClientRates(c);
            })
            .catch((e) => console.error('[poller] clients error', e)),
        );
      }
      if (now - dpiAt >= config.poll.dpiMs) {
        dpiAt = now;
        tasks.push(
          source
            .getDpi()
            .then((d) => {
              lastDpi = d;
            })
            .catch((e) => console.error('[poller] dpi error', e)),
        );
      }
      if (now - udmAt >= config.poll.udmInfoMs) {
        udmAt = now;
        tasks.push(
          source
            .getUdm()
            .then((u) => {
              if (u) lastUdm = u;
            })
            .catch((e) => console.error('[poller] udm info error', e)),
        );
      }
      await Promise.all(tasks);

      store.pushTick({
        wan,
        clients: lastClients.length ? lastClients : undefined,
        dpi: lastDpi.length ? lastDpi : undefined,
        udm: lastUdm ?? undefined,
      });
    } catch (err) {
      console.error('[poller] tick error', err);
    }
  };

  await tick();
  setInterval(() => {
    void tick();
  }, config.poll.wanMs);
}
