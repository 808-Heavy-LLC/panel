import { config } from './config.js';
import type { ClientStat, DpiCategory, Snapshot, Tick, UdmInfo, WanSample, WanStats } from './types.js';

type Listener = (tick: Tick) => void;

const startTs = Date.now();

const state = {
  source: 'mock' as 'live' | 'mock',
  wan: {
    rxBps: 0,
    txBps: 0,
    rxTotal: 0,
    txTotal: 0,
    latencyMs: null,
    wanIp: null,
    status: 'unknown',
    uptimeSec: null,
  } as WanStats,
  clients: [] as ClientStat[],
  dpi: [] as DpiCategory[],
  udm: null as UdmInfo | null,
  history: [] as WanSample[],
  features: { dpiAvailable: false, perClientRates: false },
};

const listeners = new Set<Listener>();

export const store = {
  setSource(source: 'live' | 'mock'): void {
    state.source = source;
  },

  setFeatures(features: Partial<typeof state.features>): void {
    state.features = { ...state.features, ...features };
  },

  pushTick(input: {
    wan: WanStats;
    clients?: ClientStat[];
    dpi?: DpiCategory[];
    udm?: UdmInfo;
  }): void {
    const ts = Date.now();
    state.wan = input.wan;
    if (input.clients) state.clients = input.clients;
    if (input.dpi) state.dpi = input.dpi;
    if (input.udm) state.udm = input.udm;

    const sample: WanSample = { ts, rxBps: input.wan.rxBps, txBps: input.wan.txBps };
    state.history.push(sample);
    if (state.history.length > config.history.maxSamples) {
      state.history.splice(0, state.history.length - config.history.maxSamples);
    }

    const tick: Tick = {
      ts,
      wan: input.wan,
      sample,
      ...(input.clients ? { clients: input.clients } : {}),
      ...(input.dpi ? { dpi: input.dpi } : {}),
      ...(input.udm ? { udm: input.udm } : {}),
    };

    for (const l of listeners) {
      try {
        l(tick);
      } catch (err) {
        console.error('[store] listener error', err);
      }
    }
  },

  snapshot(): Snapshot {
    return {
      ts: Date.now(),
      source: state.source,
      serverUptimeSec: Math.floor((Date.now() - startTs) / 1000),
      wan: state.wan,
      clients: state.clients,
      dpi: state.dpi,
      udm: state.udm,
      history: state.history.slice(),
      features: { ...state.features },
    };
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
