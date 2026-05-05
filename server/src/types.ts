export type WanStats = {
  rxBps: number;
  txBps: number;
  rxTotal: number;
  txTotal: number;
  latencyMs: number | null;
  wanIp: string | null;
  status: 'ok' | 'warning' | 'error' | 'unknown';
  uptimeSec: number | null;
};

export type WanSample = {
  ts: number;
  rxBps: number;
  txBps: number;
};

export type ClientStat = {
  id: string;
  name: string;
  ip: string | null;
  mac: string;
  rxBps: number;
  txBps: number;
  rxBytes: number;
  txBytes: number;
  isWired: boolean;
  signal: number | null;
  oui: string | null;
  firstSeen: number | null;
  lastSeen: number | null;
};

export type DpiCategory = {
  id: string;
  name: string;
  bytes: number;
  pct: number;
};

export type UdmInfo = {
  name: string;
  model: string;
  firmware: string;
  uptimeSec: number;
  cpuPct: number;
  memPct: number;
  tempC: number | null;
};

export type Snapshot = {
  ts: number;
  source: 'live' | 'mock';
  serverUptimeSec: number;
  wan: WanStats;
  clients: ClientStat[];
  dpi: DpiCategory[];
  udm: UdmInfo | null;
  history: WanSample[];
  features: {
    dpiAvailable: boolean;
    perClientRates: boolean;
  };
};

export type Tick = {
  ts: number;
  wan: WanStats;
  sample: WanSample;
  clients?: ClientStat[];
  dpi?: DpiCategory[];
  udm?: UdmInfo;
};

export type WsMessage =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'tick'; data: Tick }
  | { type: 'error'; message: string };
