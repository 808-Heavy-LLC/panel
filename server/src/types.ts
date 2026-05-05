export type Wan = {
  id: string;
  ifIndex: number;
  ifName: string;
  label: string;
  speedBitsPerSec: number;
  rxBps: number;
  txBps: number;
  rxTotal: number;
  txTotal: number;
  wanIp: string | null;
  status: 'ok' | 'down' | 'unknown';
  latencyMs: number | null;
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
  wans: Wan[];
  histories: Record<string, WanSample[]>;
  clients: ClientStat[];
  dpi: DpiCategory[];
  dpiCategories: DpiCategory[];
  udm: UdmInfo | null;
  features: {
    dpiAvailable: boolean;
    perClientRates: boolean;
    snmpAvailable: boolean;
  };
};

export type Tick = {
  ts: number;
  wans: Wan[];
  samples: Array<{ id: string; rxBps: number; txBps: number }>;
  clients?: ClientStat[];
  dpi?: DpiCategory[];
  dpiCategories?: DpiCategory[];
  udm?: UdmInfo;
};

export type WsMessage =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'tick'; data: Tick }
  | { type: 'error'; message: string };
