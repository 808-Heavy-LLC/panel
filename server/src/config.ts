import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadDotEnv(): void {
  try {
    const path = join(process.cwd(), '.env');
    const text = readFileSync(path, 'utf8');
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // .env is optional
  }
}

loadDotEnv();

function bool(v: string | undefined, def = false): boolean {
  if (v === undefined) return def;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function num(v: string | undefined, def: number): number {
  if (v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const mockEnv = bool(process.env.PANEL_MOCK, false);
const hasApiKey = !!process.env.UDM_API_KEY;
const hasUserPass = !!process.env.UDM_USERNAME && !!process.env.UDM_PASSWORD;
const hasHost = !!process.env.UDM_HOST;

export const config = {
  port: num(process.env.PORT, 4000),
  host: process.env.HOST ?? '0.0.0.0',
  mock: mockEnv || !hasHost || (!hasApiKey && !hasUserPass),
  udm: {
    host: process.env.UDM_HOST ?? '',
    apiKey: process.env.UDM_API_KEY ?? '',
    username: process.env.UDM_USERNAME ?? '',
    password: process.env.UDM_PASSWORD ?? '',
    site: process.env.UDM_SITE ?? 'default',
    insecureTls: bool(process.env.UDM_INSECURE_TLS, true),
  },
  poll: {
    wanMs: num(process.env.PANEL_POLL_WAN_MS, 2000),
    // UDM controller caches /stat/sta responses for ~30s, so polling
    // faster yields identical byte counters and 0 derived rates. 30s
    // matches that cache window — derived rates are a 30s rolling average.
    clientsMs: num(process.env.PANEL_POLL_CLIENTS_MS, 30000),
    dpiMs: num(process.env.PANEL_POLL_DPI_MS, 60000),
    udmInfoMs: num(process.env.PANEL_POLL_UDM_MS, 15000),
  },
  history: {
    maxSamples: num(process.env.PANEL_HISTORY_SAMPLES, 180),
  },
  webDistPath: process.env.PANEL_WEB_DIST ?? '../web/build',
};

export type Config = typeof config;
