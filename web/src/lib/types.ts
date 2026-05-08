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
  vendor: string | null;
  device: string | null;
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

export type PortNeighbor = {
  chassisId: string;
  portId: string | null;
  systemName: string | null;
};

export type NetworkPort = {
  idx: number;
  name: string;
  up: boolean;
  speedMbps: number;
  isUplink: boolean;
  poeWatts: number;
  rxBps: number;
  txBps: number;
  neighbor: PortNeighbor | null;
};

export type NetworkRadio = {
  name: string;
  band: '2g' | '5g' | '6g';
  channel: number;
  bwMhz: number;
  numClients: number;
  utilizationPct: number;
  satisfaction: number;
  txRetries: number;
  txPackets: number;
};

export type NetworkDevice = {
  id: string;
  type: 'uap' | 'usw' | 'udm' | 'uci' | 'other';
  name: string;
  model: string;
  ip: string | null;
  mac: string;
  state: number;
  uptimeSec: number;
  numClients: number;
  bytesRate: number;
  rxBytes: number;
  txBytes: number;
  satisfaction: number;
  cpuPct: number | null;
  memPct: number | null;
  tempC: number | null;
  ports: NetworkPort[];
  radios: NetworkRadio[];
  uplink: PortNeighbor | null;
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
  devices: NetworkDevice[];
  features: { dpiAvailable: boolean; perClientRates: boolean; snmpAvailable: boolean };
};

export type Tick = {
  ts: number;
  wans: Wan[];
  samples: Array<{ id: string; rxBps: number; txBps: number }>;
  clients?: ClientStat[];
  dpi?: DpiCategory[];
  dpiCategories?: DpiCategory[];
  udm?: UdmInfo;
  devices?: NetworkDevice[];
};

export type WsMessage =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'tick'; data: Tick }
  | { type: 'error'; message: string };
