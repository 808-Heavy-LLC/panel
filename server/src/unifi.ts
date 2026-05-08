import { Agent, fetch as undiciFetch } from 'undici';
import type {
  ClientStat,
  DpiCategory,
  HealthSubsystem,
  NetworkDevice,
  NetworkPort,
  NetworkRadio,
  PortNeighbor,
  UdmInfo,
} from './types.js';

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

type RawHealthMonitor = {
  target?: string;
  type?: string;
  latency_average?: number;
  availability?: number;
};

type RawHealthUptimeBucket = {
  latency_average?: number;
  availability?: number;
  monitors?: RawHealthMonitor[];
  alerting_monitors?: RawHealthMonitor[];
};

type RawHealthSubsystem = {
  subsystem?: string;
  status?: string;
  latency?: number;
  drops?: number;
  uptime?: number;
  // www-only
  xput_up?: number;
  xput_down?: number;
  speedtest_lastrun?: number;
  speedtest_status?: string;
  // wan-only
  wan_ip?: string;
  isp_name?: string;
  isp_organization?: string;
  asn?: number;
  uptime_stats?: Record<string, RawHealthUptimeBucket>;
  // lan/wlan
  num_user?: number;
  num_guest?: number;
};

function toProbe(m: RawHealthMonitor): HealthSubsystem['monitors'][number] {
  return {
    target: m.target ?? '',
    type: m.type ?? 'unknown',
    latencyMs: typeof m.latency_average === 'number' ? m.latency_average : null,
    availabilityPct: typeof m.availability === 'number' ? m.availability : null,
  };
}

function toHealthSubsystem(h: RawHealthSubsystem): HealthSubsystem {
  const status: HealthSubsystem['status'] =
    h.status === 'ok' ? 'ok' : h.status === 'warning' ? 'warning' : 'unknown';
  // The wan/wan2 entries don't carry a top-level `latency`; instead the
  // current avg lives in `uptime_stats.{WAN,WAN2}.latency_average`. Pick
  // the bucket whose key matches this subsystem (case-insensitive).
  const bucket = (() => {
    const stats = h.uptime_stats;
    if (!stats) return null;
    const want = (h.subsystem ?? '').toUpperCase();
    return stats[want] ?? Object.values(stats)[0] ?? null;
  })();
  const monitors = [...(bucket?.alerting_monitors ?? []), ...(bucket?.monitors ?? [])].map(toProbe);
  const latencyFromBucket =
    typeof bucket?.latency_average === 'number' ? bucket.latency_average : null;
  return {
    name: h.subsystem ?? 'unknown',
    status,
    latencyMs:
      typeof h.latency === 'number' ? h.latency : latencyFromBucket,
    drops: typeof h.drops === 'number' ? h.drops : null,
    uptimeSec: typeof h.uptime === 'number' ? h.uptime : null,
    xputDownMbps: typeof h.xput_down === 'number' ? h.xput_down : null,
    xputUpMbps: typeof h.xput_up === 'number' ? h.xput_up : null,
    speedtestLastRunTs: typeof h.speedtest_lastrun === 'number' ? h.speedtest_lastrun : null,
    speedtestStatus: h.speedtest_status ?? null,
    numUser: typeof h.num_user === 'number' ? h.num_user : null,
    numGuest: typeof h.num_guest === 'number' ? h.num_guest : null,
    wanIp: h.wan_ip ?? null,
    availabilityPct:
      typeof bucket?.availability === 'number' ? bucket.availability : null,
    monitors,
    ispName: h.isp_name ?? null,
    ispOrg: h.isp_organization ?? null,
    asn: typeof h.asn === 'number' ? h.asn : null,
  };
}

type RawClient = {
  id?: string;
  user_id?: string;
  mac?: string;
  ip?: string;
  hostname?: string;
  display_name?: string;
  oui?: string;
  is_wired?: boolean;
  signal?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  'rx_bytes-r'?: number;
  'tx_bytes-r'?: number;
  first_seen?: number;
  last_seen?: number;
  fingerprint?: {
    computed_dev_id?: number;
    dev_id?: number;
    dev_id_override?: number;
    has_override?: boolean;
  };
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

type RawGatewayWan = {
  ifname?: string;
  uplink_ifname?: string;
  name?: string;
  ip?: string;
  ipv6?: string[];
  mac?: string;
  netmask?: string;
  enable?: boolean;
  up?: boolean;
  is_uplink?: boolean;
  speed?: number;
  max_speed?: number;
  media?: string;
  rx_bytes?: number;
  tx_bytes?: number;
  latency?: number;
  availability?: number;
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
  /** UDM gateway WAN ports — keys are `wan1` and `wan2`. */
  wan1?: RawGatewayWan;
  wan2?: RawGatewayWan;
  /** Top-level IPv6 addresses bound to the gateway (global + link-local). */
  ipv6?: string[];
};

/** Per-WAN details extracted from the gateway device entry. Keyed by the
 *  uplink interface name (`eth9`, `eth10`, …) so the poller can match it
 *  against the SNMP-derived WAN list. */
export type GatewayWanDetails = {
  ifName: string;
  ip: string | null;
  ipv6: string | null;
  mac: string | null;
  rxBytes: number;
  txBytes: number;
  latencyMs: number | null;
  availabilityPct: number | null;
  up: boolean;
};

type RawV2Device = RawDevice & {
  ip?: string;
  mac?: string;
  state?: number;
  num_sta?: number;
  satisfaction?: number;
  'bytes-r'?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  general_temperature?: number;
  port_table?: Array<{
    port_idx?: number;
    name?: string;
    up?: boolean;
    speed?: number;
    is_uplink?: boolean;
    enable?: boolean;
    poe_enable?: boolean;
    port_poe?: boolean;
    rx_bytes?: number;
    tx_bytes?: number;
    'rx_bytes-r'?: number;
    'tx_bytes-r'?: number;
    poe_power?: string;
    // LLDP. UniFi has used both flat fields and a nested table across
    // firmware versions; we read whichever is present.
    lldp_chassis_id?: string;
    lldp_port_id?: string;
    lldp_system_name?: string;
    lldp_table?: Array<{
      chassis_id?: string;
      port_id?: string;
      system_name?: string;
    }>;
  }>;
  // Device-level LLDP table (some firmwares put it here keyed by local
  // port index instead of inline in port_table).
  lldp_table?: Array<{
    local_port_idx?: number;
    chassis_id?: string;
    port_id?: string;
    system_name?: string;
  }>;
  // APs report their upstream switch here rather than via per-port LLDP.
  uplink?: {
    uplink_mac?: string;
    uplink_remote_port?: number | string;
    uplink_device_name?: string;
    type?: string;
  };
  radio_table_stats?: Array<{
    name?: string;
    radio?: string;
    channel?: number;
    bw?: number;
    'num_sta'?: number;
    'user-num_sta'?: number;
    cu_total?: number;
    satisfaction?: number;
    tx_retries?: number;
    tx_packets?: number;
  }>;
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
  /** Combined-id (cat<<16 | app) → human name. Loaded once at connect. */
  private appCatalog: Map<number, string> = new Map();
  /** Category id → human name. Loaded from same UI catalog as appCatalog;
   *  authoritative over the hardcoded fallback in DPI_CATEGORIES. */
  private categoryCatalog: Map<number, string> = new Map();
  /** Device fingerprint id → device name (e.g. 2900 → "Apple TV"). Loaded
   *  from /v2/api/fingerprint_devices/0 once at connect. */
  private deviceCatalog: Map<number, string> = new Map();

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
      // Best-effort: load the catalogs so /api/snapshot can label top apps
      // and use authoritative category names. Failure here doesn't block.
      try {
        const { apps, categories } = await this.fetchDpiCatalogs();
        this.appCatalog = apps;
        this.categoryCatalog = categories;
        console.log(
          `[unifi] DPI catalog loaded: ${apps.size} apps, ${categories.size} categories`,
        );
      } catch (err) {
        console.error('[unifi] DPI catalog fetch failed:', err);
      }
      try {
        this.deviceCatalog = await this.fetchDeviceCatalog();
        console.log(`[unifi] device catalog loaded: ${this.deviceCatalog.size} entries`);
      } catch (err) {
        console.error('[unifi] device catalog fetch failed:', err);
      }
    } else if (this.mode === 'integration') {
      // Probe sites endpoint to verify key works.
      await this.integrationGet('/proxy/network/integration/v1/sites');
    } else {
      throw new Error('No UDM credentials configured');
    }
  }

  /** Fetch the UniFi UI's `dynamic.dpi.js` and parse its
   *  `<id>:{name:"..."}` entries. The asset path includes a hash that
   *  changes per firmware build, so we discover it from the main HTML.
   *  The file contains both category entries (small ids) and combined
   *  app entries (cat<<16 | app); we extract both. The within-category
   *  app sub-blocks reuse small ids, but those re-appear after the
   *  category block so first-occurrence-wins on small ids gives us the
   *  category names. */
  private async fetchDpiCatalogs(): Promise<{
    apps: Map<number, string>;
    categories: Map<number, string>;
  }> {
    const html = await this.legacyGetText('/manage/');
    const m = html.match(/angular\/([a-zA-Z0-9_-]+)\/js\/index\.js/);
    if (!m) throw new Error('could not find angular asset hash in /manage/');
    const js = await this.legacyGetText(`/manage/angular/${m[1]}/js/dynamic.dpi.js`);
    const apps = new Map<number, string>();
    const categories = new Map<number, string>();
    for (const entry of js.matchAll(/(\d+):\{name:"([^"]+)"/g)) {
      const id = Number(entry[1]);
      const name = entry[2]!;
      if (id >= 65536) apps.set(id, name);
      else if (id <= 255 && !categories.has(id)) categories.set(id, name);
    }
    return { apps, categories };
  }

  /** Fetch UniFi's device-fingerprint catalog. Maps numeric dev_id (the
   *  fingerprint engine's identifier for a make+model) to a human-readable
   *  name like "Apple TV" or "Ring Backyard". */
  private async fetchDeviceCatalog(): Promise<Map<number, string>> {
    const r = await this.legacyGet<{
      dev_ids?: Record<string, { name?: string }>;
    }>('/v2/api/fingerprint_devices/0');
    const map = new Map<number, string>();
    for (const [id, entry] of Object.entries(r.dev_ids ?? {})) {
      const name = entry.name?.trim();
      if (name) map.set(Number(id), name);
    }
    return map;
  }

  private toClient(c: RawClient): ClientStat {
    const id = c.id ?? c.user_id ?? c.mac ?? '';
    const fp = c.fingerprint;
    // Override beats the auto-computed id (lets users rename in UDM UI).
    const devId = fp?.has_override
      ? (fp.dev_id_override ?? fp.dev_id)
      : (fp?.computed_dev_id ?? fp?.dev_id);
    const device = devId ? (this.deviceCatalog.get(devId) ?? null) : null;
    const vendor = c.oui && c.oui.length > 0 ? c.oui : null;
    return {
      id,
      name: c.display_name ?? c.hostname ?? c.mac ?? id,
      ip: c.ip ?? null,
      mac: c.mac ?? '',
      rxBps: c['rx_bytes-r'] ?? 0,
      txBps: c['tx_bytes-r'] ?? 0,
      rxBytes: c.rx_bytes ?? 0,
      txBytes: c.tx_bytes ?? 0,
      isWired: c.is_wired === true,
      signal: c.signal ?? null,
      vendor,
      device,
      firstSeen: c.first_seen ?? null,
      lastSeen: c.last_seen ?? null,
    };
  }

  private async legacyGetText(path: string): Promise<string> {
    const url = `${this.base}/proxy/network${path}`;
    const doFetch = () =>
      undiciFetch(url, {
        headers: { cookie: this.cookie, 'x-csrf-token': this.csrfToken },
        dispatcher: this.agent,
      });
    let res = await doFetch();
    if (res.status === 401 || res.status === 403) {
      await this.legacyLogin();
      res = await doFetch();
    }
    if (!res.ok) throw new Error(`UDM GET ${path} failed: ${res.status}`);
    return res.text();
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
      // The v2 endpoint returns much richer client info: a UI-formatted
      // display_name, vendor (oui), and a fingerprint object with the
      // computed device id we look up against the fingerprint catalog.
      const r = await this.legacyGet<RawClient[]>(
        `/v2/api/site/${this.opts.site}/clients/active?includeTrafficUsage=true&includeUnifiDevices=false`,
      );
      return (r ?? []).map((c) => this.toClient(c));
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
        vendor: null,
        device: null,
        firstSeen: c.connectedAt ? Math.floor(new Date(c.connectedAt).getTime() / 1000) : null,
        lastSeen: null,
      }));
    }
    return [];
  }

  async getTraffic(): Promise<{ apps: DpiCategory[]; categories: DpiCategory[] }> {
    if (this.mode !== 'legacy') return { apps: [], categories: [] };
    // UniFi Network 9.x retired /stat/dpi (still 200s but always empty).
    // The dashboard now reads from /v2/.../traffic, which expects ms-precision
    // timestamps and an explicit window. 24h matches what the UI's "1D" shows.
    const end = Date.now();
    const start = end - 24 * 60 * 60 * 1000;
    const r = await this.legacyGet<RawTrafficResponse>(
      `/v2/api/site/${this.opts.site}/traffic?start=${start}&end=${end}&includeUnidentified=true`,
    );
    const rawApps = r.total_usage_by_app ?? [];
    const bytesOf = (a: RawTrafficApp) =>
      a.total_bytes ?? (a.bytes_received ?? 0) + (a.bytes_transmitted ?? 0);
    const total = rawApps.reduce((acc, a) => acc + bytesOf(a), 0);

    const catName = (cat: number): string =>
      this.categoryCatalog.get(cat) ?? dpiCatName(cat);

    const apps = rawApps
      .map((a) => {
        const cat = a.category ?? 255;
        const app = a.application ?? 0;
        const combined = (cat << 16) | app;
        const bytes = bytesOf(a);
        const name =
          this.appCatalog.get(combined) ??
          (cat === 255 ? 'Unidentified' : `${catName(cat)} · ${app}`);
        return { id: String(combined), name, bytes, pct: total > 0 ? bytes / total : 0 };
      })
      .sort((a, b) => b.bytes - a.bytes);

    const byCat = new Map<number, number>();
    for (const a of rawApps) {
      const cat = a.category ?? 255;
      byCat.set(cat, (byCat.get(cat) ?? 0) + bytesOf(a));
    }
    const categories = [...byCat.entries()]
      .map(([cat, bytes]) => ({
        id: String(cat),
        name: catName(cat),
        bytes,
        pct: total > 0 ? bytes / total : 0,
      }))
      .sort((a, b) => b.bytes - a.bytes);

    return { apps, categories };
  }

  async getDevices(): Promise<NetworkDevice[]> {
    if (this.mode !== 'legacy') return [];
    // The v2 device endpoint doesn't include poe_power on this firmware
    // — the per-port wattage only lives on the legacy stat/device. Fetch
    // both in parallel and merge the wattages by (device mac, port idx).
    const [v2, legacy] = await Promise.all([
      this.legacyGet<{ network_devices?: RawV2Device[] }>(
        `/v2/api/site/${this.opts.site}/device?separateUnmanaged=true&includeTrafficUsage=true`,
      ),
      this.legacyGet<{
        data?: Array<{
          mac?: string;
          port_table?: Array<{ port_idx?: number; poe_power?: string }>;
        }>;
      }>(`/api/s/${this.opts.site}/stat/device`).catch((e) => {
        console.error('[unifi] PoE map fetch failed:', e);
        return { data: [] as never[] };
      }),
    ]);
    const poeByMac = new Map<string, Map<number, number>>();
    for (const d of legacy.data ?? []) {
      const mac = (d.mac ?? '').toLowerCase();
      if (!mac) continue;
      const ports = new Map<number, number>();
      for (const p of d.port_table ?? []) {
        const w = Number.parseFloat(String(p.poe_power ?? '0'));
        if (Number.isFinite(w) && w > 0 && p.port_idx != null) {
          ports.set(p.port_idx, w);
        }
      }
      if (ports.size > 0) poeByMac.set(mac, ports);
    }
    return (v2.network_devices ?? []).map((d) =>
      toDevice(d, poeByMac.get((d.mac ?? '').toLowerCase()) ?? new Map()),
    );
  }

  /** Health subsystems from `/api/s/{site}/stat/health`. UniFi returns
   *  an array of entries keyed by `subsystem`. We pass through the
   *  fields useful for the dashboard and skip the rest. */
  async getHealth(): Promise<HealthSubsystem[]> {
    if (this.mode !== 'legacy') return [];
    const r = await this.legacyGet<{ data?: RawHealthSubsystem[] }>(
      `/api/s/${this.opts.site}/stat/health`,
    );
    return (r.data ?? []).map(toHealthSubsystem);
  }

  /** Per-WAN details from the gateway device entry. Keyed by uplink
   *  ifname (`eth9`, `eth10`, …). Returns `[]` outside legacy mode or
   *  when no gateway is reported. */
  async getWanDetails(): Promise<GatewayWanDetails[]> {
    if (this.mode !== 'legacy') return [];
    const r = await this.legacyGet<{ data: RawDevice[] }>(`/api/s/${this.opts.site}/stat/device`);
    const gw = (r.data ?? []).find(
      (d) =>
        d.is_gateway === true ||
        d.type === 'ugw' ||
        (d.model ?? '').startsWith('UDM') ||
        (d.model ?? '').startsWith('UGW'),
    );
    if (!gw) return [];
    const ipv6Global = (gw.ipv6 ?? []).find((a) => !a.startsWith('fe80')) ?? null;
    const out: GatewayWanDetails[] = [];
    for (const w of [gw.wan1, gw.wan2]) {
      if (!w) continue;
      const ifName = w.uplink_ifname ?? w.ifname ?? w.name ?? '';
      if (!ifName) continue;
      out.push({
        ifName,
        ip: w.ip ?? null,
        // gw.wan1.ipv6 is link-local only; the global prefix lives on the
        // gateway-level `ipv6` field, which we share across WANs since
        // the UDM doesn't break out per-WAN globals here.
        ipv6: ipv6Global,
        mac: w.mac ?? null,
        rxBytes: typeof w.rx_bytes === 'number' ? w.rx_bytes : 0,
        txBytes: typeof w.tx_bytes === 'number' ? w.tx_bytes : 0,
        latencyMs: typeof w.latency === 'number' ? w.latency : null,
        availabilityPct: typeof w.availability === 'number' ? w.availability : null,
        up: w.up === true,
      });
    }
    return out;
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

function bandFromRadio(name: string | undefined, channel: number): '2g' | '5g' | '6g' {
  // UniFi tags radios as 'ng' (2.4G), 'na' (5G), '6e' (6G). Fall back to
  // channel-number heuristic when name is missing.
  if (name === '6e' || name?.startsWith('6')) return '6g';
  if (name === 'ng' || name === 'n') return '2g';
  if (name === 'na' || name === 'ac' || name === 'ax') return '5g';
  if (channel >= 1 && channel <= 14) return '2g';
  if (channel >= 32 && channel <= 177) return '5g';
  return '6g';
}

function normalizeMac(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase();
}

function neighborFromPort(
  p: NonNullable<RawV2Device['port_table']>[number],
): PortNeighbor | null {
  const flatChassis = normalizeMac(p.lldp_chassis_id);
  if (flatChassis) {
    return {
      chassisId: flatChassis,
      portId: p.lldp_port_id ?? null,
      systemName: p.lldp_system_name ?? null,
    };
  }
  const nested = p.lldp_table?.[0];
  if (nested) {
    const chassis = normalizeMac(nested.chassis_id);
    if (chassis) {
      return {
        chassisId: chassis,
        portId: nested.port_id ?? null,
        systemName: nested.system_name ?? null,
      };
    }
  }
  return null;
}

function toPort(
  p: NonNullable<RawV2Device['port_table']>[number],
  deviceLldp: Map<number, PortNeighbor>,
  poeByIdx: Map<number, number>,
): NetworkPort {
  const idx = p.port_idx ?? 0;
  // The v2 device endpoint we walk for ports doesn't carry poe_power
  // on this firmware. We supplement from the legacy /stat/device call
  // (merged in getDevices), keyed by port index. Fall back to whatever
  // poe_power happens to be in the v2 payload, in case a future
  // firmware does include it.
  const v2Poe = Number.parseFloat(p.poe_power ?? '0');
  const v2PoeWatts = Number.isFinite(v2Poe) && v2Poe > 0 ? v2Poe : 0;
  const poeWatts = poeByIdx.get(idx) ?? v2PoeWatts;
  const neighbor = neighborFromPort(p) ?? deviceLldp.get(idx) ?? null;
  return {
    idx,
    name: p.name ?? `Port ${idx}`,
    up: p.up === true,
    speedMbps: p.speed ?? 0,
    isUplink: p.is_uplink === true,
    poeWatts,
    rxBps: p['rx_bytes-r'] ?? 0,
    txBps: p['tx_bytes-r'] ?? 0,
    neighbor,
  };
}

function toRadio(r: NonNullable<RawV2Device['radio_table_stats']>[number]): NetworkRadio {
  return {
    name: r.name ?? r.radio ?? '',
    band: bandFromRadio(r.radio, r.channel ?? 0),
    channel: r.channel ?? 0,
    bwMhz: r.bw ?? 0,
    numClients: r['user-num_sta'] ?? r.num_sta ?? 0,
    utilizationPct: r.cu_total ?? 0,
    satisfaction: r.satisfaction ?? 0,
    txRetries: r.tx_retries ?? 0,
    txPackets: r.tx_packets ?? 0,
  };
}

function toDevice(d: RawV2Device, poeByIdx: Map<number, number>): NetworkDevice {
  const stats = d['system-stats'];
  const type = (['uap', 'usw', 'udm', 'uci'] as const).includes(d.type as never)
    ? (d.type as NetworkDevice['type'])
    : 'other';
  const deviceLldp = new Map<number, PortNeighbor>();
  for (const e of d.lldp_table ?? []) {
    const idx = e.local_port_idx;
    const chassis = normalizeMac(e.chassis_id);
    if (typeof idx === 'number' && chassis) {
      deviceLldp.set(idx, {
        chassisId: chassis,
        portId: e.port_id ?? null,
        systemName: e.system_name ?? null,
      });
    }
  }
  const ports = (d.port_table ?? []).map((p) => toPort(p, deviceLldp, poeByIdx));
  const uplinkMac = normalizeMac(d.uplink?.uplink_mac);
  const uplink: PortNeighbor | null = uplinkMac
    ? {
        chassisId: uplinkMac,
        portId:
          d.uplink?.uplink_remote_port != null
            ? String(d.uplink.uplink_remote_port)
            : null,
        systemName: d.uplink?.uplink_device_name ?? null,
      }
    : null;
  // Switches report bytes-r=0 and rx/tx_bytes=0 at the device level; the
  // real numbers live on each port. Sum across ports when the device
  // total is empty. (Sum double-counts each frame — counted on both the
  // ingress and egress port — which matches how switch fabric throughput
  // is conventionally reported.)
  const portsBytesRate = ports.reduce((s, p) => s + p.rxBps + p.txBps, 0);
  const bytesRate = d['bytes-r'] || portsBytesRate;
  const portsRxBytes = (d.port_table ?? []).reduce((s, p) => s + (p.rx_bytes ?? 0), 0);
  const portsTxBytes = (d.port_table ?? []).reduce((s, p) => s + (p.tx_bytes ?? 0), 0);
  const rxBytes = d.rx_bytes || portsRxBytes;
  const txBytes = d.tx_bytes || portsTxBytes;
  return {
    id: d._id ?? d.mac ?? '',
    type,
    name: d.name ?? d.hostname ?? d.mac ?? '',
    model: d.model ?? '',
    ip: d.ip ?? null,
    mac: d.mac ?? '',
    state: d.state ?? 0,
    uptimeSec: d.uptime ?? 0,
    numClients: d.num_sta ?? 0,
    bytesRate,
    rxBytes,
    txBytes,
    satisfaction: d.satisfaction ?? 0,
    cpuPct: stats?.cpu ? parsePct(stats.cpu) : null,
    memPct: stats?.mem ? parsePct(stats.mem) : null,
    tempC: d.general_temperature ?? null,
    ports,
    radios: (d.radio_table_stats ?? []).map(toRadio),
    uplink,
  };
}

