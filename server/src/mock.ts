import type { ClientStat, DpiCategory, UdmInfo, WanStats } from './types.js';

const CLIENT_FIXTURES = [
  { name: 'tv-livingroom', isWired: true, baseDown: 35_000_000, baseUp: 800_000 },
  { name: 'mbp-matt', isWired: false, baseDown: 8_000_000, baseUp: 2_500_000 },
  { name: 'iphone-matt', isWired: false, baseDown: 1_200_000, baseUp: 200_000 },
  { name: 'ps5-basement', isWired: true, baseDown: 18_000_000, baseUp: 1_400_000 },
  { name: 'nest-thermostat', isWired: false, baseDown: 4_000, baseUp: 2_000 },
  { name: 'ipad-kitchen', isWired: false, baseDown: 6_000_000, baseUp: 400_000 },
  { name: 'sonos-livingroom', isWired: false, baseDown: 1_800_000, baseUp: 80_000 },
  { name: 'macbook-work', isWired: true, baseDown: 12_000_000, baseUp: 4_000_000 },
  { name: 'nas-storage', isWired: true, baseDown: 200_000, baseUp: 5_000_000 },
  { name: 'unifi-camera-front', isWired: true, baseDown: 80_000, baseUp: 1_200_000 },
  { name: 'unifi-camera-back', isWired: true, baseDown: 80_000, baseUp: 1_100_000 },
  { name: 'roku-bedroom', isWired: false, baseDown: 9_000_000, baseUp: 100_000 },
  { name: 'switch-lite', isWired: false, baseDown: 800_000, baseUp: 60_000 },
  { name: 'ring-doorbell', isWired: false, baseDown: 40_000, baseUp: 380_000 },
  { name: 'echo-kitchen', isWired: false, baseDown: 30_000, baseUp: 12_000 },
  { name: 'hue-bridge', isWired: true, baseDown: 8_000, baseUp: 4_000 },
  { name: 'pihole-pi', isWired: true, baseDown: 100_000, baseUp: 50_000 },
];

const DPI_FIXTURES = [
  { name: 'Streaming', weight: 62 },
  { name: 'Web', weight: 14 },
  { name: 'Games', weight: 9 },
  { name: 'Social', weight: 6 },
  { name: 'Cloud', weight: 4 },
  { name: 'Conferencing', weight: 3 },
  { name: 'Update Tools', weight: 2 },
];

let totalRx = 1_200_000_000_000;
let totalTx = 180_000_000_000;
let phase = 0;

function noise(amp: number): number {
  return (Math.random() - 0.5) * amp;
}

function envelope(t: number): number {
  // Simulate a rolling activity pattern: combination of sine waves
  return 0.65 + 0.25 * Math.sin(t / 9.7) + 0.15 * Math.sin(t / 3.3 + 1.1) + 0.1 * Math.sin(t / 1.7);
}

export function mockWan(intervalMs = 2000): WanStats {
  phase += intervalMs / 1000;
  const env = envelope(phase);
  const rx = Math.max(0, 60_000_000 * env + noise(15_000_000));
  const tx = Math.max(0, 4_000_000 * env + noise(800_000));
  totalRx += (rx * intervalMs) / 1000;
  totalTx += (tx * intervalMs) / 1000;
  return {
    rxBps: rx,
    txBps: tx,
    rxTotal: totalRx,
    txTotal: totalTx,
    latencyMs: 6 + Math.random() * 6,
    wanIp: '203.0.113.42',
    status: 'ok',
    uptimeSec: 1_234_567 + Math.floor(phase),
  };
}

export function mockClients(): ClientStat[] {
  const env = envelope(phase);
  return CLIENT_FIXTURES.map((c, i) => {
    const jitter = 0.7 + Math.random() * 0.6;
    const rxBps = c.baseDown * env * jitter;
    const txBps = c.baseUp * env * jitter;
    return {
      id: `mock-${i}`,
      name: c.name,
      ip: `192.168.1.${20 + i}`,
      mac: `aa:bb:cc:${i.toString(16).padStart(2, '0')}:00:00`,
      rxBps,
      txBps,
      rxBytes: 1_000_000_000 + i * 50_000_000 + Math.floor(rxBps * phase),
      txBytes: 100_000_000 + i * 5_000_000 + Math.floor(txBps * phase),
      isWired: c.isWired,
      signal: c.isWired ? null : -45 - Math.floor(Math.random() * 30),
      oui: null,
      firstSeen: Math.floor(Date.now() / 1000) - 86400 - i * 3600,
      lastSeen: Math.floor(Date.now() / 1000),
    };
  });
}

export function mockDpi(): DpiCategory[] {
  const totalWeight = DPI_FIXTURES.reduce((a, b) => a + b.weight, 0);
  return DPI_FIXTURES.map((d, i) => ({
    id: `mock-${i}`,
    name: d.name,
    bytes: d.weight * 100_000_000_000,
    pct: d.weight / totalWeight,
  }));
}

export function mockUdm(): UdmInfo {
  const env = envelope(phase);
  return {
    name: 'UDM Pro Max',
    model: 'UDM-Pro-Max',
    firmware: '4.1.13',
    uptimeSec: 1_234_567 + Math.floor(phase),
    cpuPct: 12 + env * 25 + noise(3),
    memPct: 38 + noise(4),
    tempC: 52 + env * 4 + noise(1),
  };
}
