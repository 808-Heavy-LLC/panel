import { Agent, fetch as undiciFetch } from 'undici';
import type { ClientStat, DpiCategory, UdmInfo } from './types.js';

type Mode = 'legacy' | 'integration' | 'none';

type RawHealth = {
  subsystem?: string;
  status?: string;
  wan_ip?: string;
  'rx_bytes-r'?: number;
  'tx_bytes-r'?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  uptime?: number;
  latency?: number;
  xput_up?: number;
  xput_down?: number;
};

type RawClient = {
  _id?: string;
  user_id?: string;
  mac?: string;
  ip?: string;
  hostname?: string;
  name?: string;
  oui?: string;
  is_wired?: boolean;
  signal?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  'rx_bytes-r'?: number;
  'tx_bytes-r'?: number;
  first_seen?: number;
  last_seen?: number;
};

type RawTrafficApp = {
  application?: number;
  category?: number;
  bytes_received?: number;
  bytes_transmitted?: number;
  total_bytes?: number;
  client_count?: number;
};

type RawTrafficResponse = {
  total_usage_by_app?: RawTrafficApp[];
  client_usage_by_app?: RawTrafficApp[];
};

type RawDevice = {
  _id?: string;
  name?: string;
  hostname?: string;
  model?: string;
  type?: string;
  is_gateway?: boolean;
  version?: string;
  uptime?: number;
  'system-stats'?: { cpu?: string; mem?: string; uptime?: string };
  temperatures?: Array<{ value?: number; name?: string; type?: string }>;
};

const MODEL_NAMES: Record<string, string> = {
  UDMPROMAX: 'UDM Pro Max',
  UDMPRO: 'UDM Pro',
  UDMSE: 'UDM SE',
  UDMR: 'UDM R',
  UDM: 'UDM',
};

const DPI_CATEGORIES: Record<number, string> = {
  0: 'Instant Messaging',
  1: 'P2P',
  2: 'File Transfer',
  3: 'Streaming',
  4: 'Mail',
  5: 'VoIP',
  6: 'Database',
  7: 'Games',
  8: 'Apps',
  9: 'Web',
  10: 'Network Tools',
  11: 'Crypto',
  12: 'Update Tools',
  13: 'Conferencing',
  14: 'Music',
  15: 'Social',
  16: 'Advertising',
  17: 'Adult',
  18: 'News',
  19: 'Shopping',
  20: 'Cloud',
  21: 'Business',
  22: 'Privacy',
  23: 'Remote Access',
  24: 'Game Streaming',
  255: 'Unidentified',
};

function dpiCatName(id: number): string {
  return DPI_CATEGORIES[id] ?? `Category ${id}`;
}

export type UnifiOpts = {
  host: string;
  apiKey?: string;
  username?: string;
  password?: string;
  site: string;
  insecureTls: boolean;
};

export class UnifiClient {
  private mode: Mode = 'none';
  private cookie = '';
  private csrfToken = '';
  private agent: Agent;
  private base: string;

  constructor(private opts: UnifiOpts) {
    this.agent = new Agent({
      connect: { rejectUnauthorized: !opts.insecureTls },
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    });
    this.base = `https://${opts.host}`;
    if (opts.username && opts.password) this.mode = 'legacy';
    else if (opts.apiKey) this.mode = 'integration';
  }

  getMode(): Mode {
    return this.mode;
  }

  async connect(): Promise<void> {
    if (this.mode === 'legacy') {
      await this.legacyLogin();
    } else if (this.mode === 'integration') {
      // Probe sites endpoint to verify key works.
      await this.integrationGet('/proxy/network/integration/v1/sites');
    } else {
      throw new Error('No UDM credentials configured');
    }
  }

  private async legacyLogin(): Promise<void> {
    const res = await undiciFetch(`${this.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: this.opts.username,
        password: this.opts.password,
        remember: true,
      }),
      dispatcher: this.agent,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`UDM login failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const setCookie = res.headers.get('set-cookie') ?? '';
    const tokenMatch = setCookie.match(/TOKEN=([^;]+)/);
    if (!tokenMatch) throw new Error('UDM login: no TOKEN cookie returned');
    this.cookie = `TOKEN=${tokenMatch[1]}`;
    this.csrfToken = res.headers.get('x-csrf-token') ?? res.headers.get('x-updated-csrf-token') ?? '';
  }

  private async legacyGet<T>(path: string): Promise<T> {
    const url = `${this.base}/proxy/network${path}`;
    const doFetch = () =>
      undiciFetch(url, {
        headers: {
          cookie: this.cookie,
          'x-csrf-token': this.csrfToken,
          accept: 'application/json',
        },
        dispatcher: this.agent,
      });
    let res = await doFetch();
    if (res.status === 401 || res.status === 403) {
      await this.legacyLogin();
      res = await doFetch();
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`UDM GET ${path} failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  private async integrationGet<T>(path: string): Promise<T> {
    const res = await undiciFetch(`${this.base}${path}`, {
      headers: {
        'x-api-key': this.opts.apiKey ?? '',
        accept: 'application/json',
      },
      dispatcher: this.agent,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`UDM integration GET ${path} failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async getClients(): Promise<ClientStat[]> {
    if (this.mode === 'legacy') {
      const r = await this.legacyGet<{ data: RawClient[] }>(`/api/s/${this.opts.site}/stat/sta`);
      return (r.data ?? []).map(toClient);
    }
    if (this.mode === 'integration') {
      const sites = await this.integrationGet<{ data: Array<{ id: string }> }>(
        '/proxy/network/integration/v1/sites',
      );
      const siteId = sites.data?.[0]?.id;
      if (!siteId) return [];
      const r = await this.integrationGet<{
        data: Array<{
          id: string;
          name?: string;
          ipAddress?: string;
          macAddress?: string;
          type?: string;
          connectedAt?: string;
        }>;
      }>(`/proxy/network/integration/v1/sites/${siteId}/clients?limit=200`);
      return (r.data ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? c.macAddress ?? c.id,
        ip: c.ipAddress ?? null,
        mac: c.macAddress ?? '',
        rxBps: 0,
        txBps: 0,
        rxBytes: 0,
        txBytes: 0,
        isWired: c.type === 'WIRED',
        signal: null,
        oui: null,
        firstSeen: c.connectedAt ? Math.floor(new Date(c.connectedAt).getTime() / 1000) : null,
        lastSeen: null,
      }));
    }
    return [];
  }

  async getDpi(): Promise<DpiCategory[]> {
    if (this.mode !== 'legacy') return [];
    // UniFi Network 9.x retired /stat/dpi (still 200s but always empty).
    // The dashboard now reads from /v2/.../traffic, which expects ms-precision
    // timestamps and an explicit window. 24h matches what the UI's "1D" shows.
    const end = Date.now();
    const start = end - 24 * 60 * 60 * 1000;
    const r = await this.legacyGet<RawTrafficResponse>(
      `/v2/api/site/${this.opts.site}/traffic?start=${start}&end=${end}&includeUnidentified=true`,
    );
    const apps = r.total_usage_by_app ?? [];
    const byCat = new Map<number, number>();
    for (const a of apps) {
      const cat = a.category ?? 255;
      const bytes = a.total_bytes ?? (a.bytes_received ?? 0) + (a.bytes_transmitted ?? 0);
      byCat.set(cat, (byCat.get(cat) ?? 0) + bytes);
    }
    const total = [...byCat.values()].reduce((a, b) => a + b, 0);
    return [...byCat.entries()]
      .map(([cat, bytes]) => ({
        id: String(cat),
        name: dpiCatName(cat),
        bytes,
        pct: total > 0 ? bytes / total : 0,
      }))
      .sort((a, b) => b.bytes - a.bytes);
  }

  async getUdmInfo(): Promise<UdmInfo | null> {
    if (this.mode !== 'legacy') return null;
    // Hardware stats (cpu/mem/temp) live on the gateway *device* entry,
    // not on /stat/sysinfo (which is just controller/Network-app metadata).
    const r = await this.legacyGet<{ data: RawDevice[] }>(`/api/s/${this.opts.site}/stat/device`);
    const gw = (r.data ?? []).find(
      (d) =>
        d.is_gateway === true ||
        d.type === 'ugw' ||
        (d.model ?? '').startsWith('UDM') ||
        (d.model ?? '').startsWith('UGW'),
    );
    if (!gw) return null;
    const stats = gw['system-stats'];
    const cpuTemp =
      gw.temperatures?.find((t) => t.type === 'cpu')?.value ??
      gw.temperatures?.[0]?.value ??
      null;
    const uptimeFromStats = stats?.uptime ? Number.parseInt(stats.uptime, 10) : NaN;
    return {
      name: gw.name ?? gw.hostname ?? 'UDM',
      model: MODEL_NAMES[gw.model ?? ''] ?? gw.model ?? 'Gateway',
      firmware: gw.version ?? '',
      uptimeSec: Number.isFinite(uptimeFromStats) ? uptimeFromStats : (gw.uptime ?? 0),
      cpuPct: parsePct(stats?.cpu),
      memPct: parsePct(stats?.mem),
      tempC: cpuTemp,
    };
  }
}

function parsePct(v: string | undefined): number {
  if (!v) return 0;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function toClient(c: RawClient): ClientStat {
  const id = c._id ?? c.user_id ?? c.mac ?? '';
  return {
    id,
    name: c.name ?? c.hostname ?? c.mac ?? id,
    ip: c.ip ?? null,
    mac: c.mac ?? '',
    rxBps: c['rx_bytes-r'] ?? 0,
    txBps: c['tx_bytes-r'] ?? 0,
    rxBytes: c.rx_bytes ?? 0,
    txBytes: c.tx_bytes ?? 0,
    isWired: c.is_wired === true,
    signal: c.signal ?? null,
    oui: c.oui ?? null,
    firstSeen: c.first_seen ?? null,
    lastSeen: c.last_seen ?? null,
  };
}
