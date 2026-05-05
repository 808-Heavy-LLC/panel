import type { ClientStat, DpiCategory, Snapshot, Tick, UdmInfo, WanSample, WanStats, WsMessage } from './types.js';

type ConnectionState = 'connecting' | 'open' | 'closed' | 'error';

const MAX_HISTORY = 240;

function emptyWan(): WanStats {
  return {
    rxBps: 0,
    txBps: 0,
    rxTotal: 0,
    txTotal: 0,
    latencyMs: null,
    wanIp: null,
    status: 'unknown',
    uptimeSec: null,
  };
}

class PanelStore {
  connection = $state<ConnectionState>('connecting');
  source = $state<'live' | 'mock'>('mock');
  serverUptimeSec = $state(0);
  wan = $state<WanStats>(emptyWan());
  clients = $state<ClientStat[]>([]);
  dpi = $state<DpiCategory[]>([]);
  udm = $state<UdmInfo | null>(null);
  history = $state<WanSample[]>([]);
  features = $state({ dpiAvailable: false, perClientRates: false });
  lastTickAt = $state(0);

  applySnapshot(s: Snapshot): void {
    this.source = s.source;
    this.serverUptimeSec = s.serverUptimeSec;
    this.wan = s.wan;
    this.clients = s.clients;
    this.dpi = s.dpi;
    this.udm = s.udm;
    this.history = s.history.slice(-MAX_HISTORY);
    this.features = s.features;
    this.lastTickAt = s.ts;
  }

  applyTick(t: Tick): void {
    this.wan = t.wan;
    if (t.clients) this.clients = t.clients;
    if (t.dpi) this.dpi = t.dpi;
    if (t.udm) this.udm = t.udm;
    this.history = [...this.history, t.sample].slice(-MAX_HISTORY);
    this.lastTickAt = t.ts;
  }
}

export const panel = new PanelStore();

export function connectWs(): () => void {
  let ws: WebSocket | null = null;
  let reconnectDelay = 1000;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function open() {
    if (closed) return;
    panel.connection = 'connecting';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.addEventListener('open', () => {
      panel.connection = 'open';
      reconnectDelay = 1000;
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage;
        if (msg.type === 'snapshot') panel.applySnapshot(msg.data);
        else if (msg.type === 'tick') panel.applyTick(msg.data);
      } catch (err) {
        console.error('[ws] parse error', err);
      }
    });
    ws.addEventListener('close', () => {
      panel.connection = 'closed';
      if (closed) return;
      reconnectTimer = setTimeout(open, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.6, 10_000);
    });
    ws.addEventListener('error', () => {
      panel.connection = 'error';
    });
  }

  open();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}
