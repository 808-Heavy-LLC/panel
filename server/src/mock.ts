import type { ClientStat, DpiCategory, UdmInfo, Wan } from './types.js';

const CLIENT_FIXTURES = [
  { name: 'tv-livingroom', isWired: true, baseDown: 35_000_000, baseUp: 800_000 },
  { name: 'mbp-matt', isWired: false, baseDown: 8_000_000, baseUp: 2_500_000 },
  { name: 'iphone-matt', isWired: false, baseDown: 1_200_000, baseUp: 200_000 },
  { name: 'ps5-basement', isWired: true, baseDown: 18_000_000, baseUp: 1_400_000, vendor: 'Sony Interactive Entertainment', device: 'PlayStation 5' },
  { name: 'nest-thermostat', isWired: false, baseDown: 4_000, baseUp: 2_000, vendor: 'Google, Inc.', device: 'Nest Thermostat' },
  { name: 'ipad-kitchen', isWired: false, baseDown: 6_000_000, baseUp: 400_000, vendor: 'Apple, Inc.', device: 'iPad' },
  { name: 'sonos-livingroom', isWired: false, baseDown: 1_800_000, baseUp: 80_000, vendor: 'Sonos, Inc.', device: 'Sonos Speaker' },
  { name: 'macbook-work', isWired: true, baseDown: 12_000_000, baseUp: 4_000_000, vendor: 'Apple, Inc.', device: 'MacBook Pro' },
  { name: 'nas-storage', isWired: true, baseDown: 200_000, baseUp: 5_000_000, vendor: 'Synology Inc.', device: 'NAS' },
  { name: 'unifi-camera-front', isWired: true, baseDown: 80_000, baseUp: 1_200_000, vendor: 'Ubiquiti Inc.', device: 'UniFi Protect Camera' },
  { name: 'unifi-camera-back', isWired: true, baseDown: 80_000, baseUp: 1_100_000, vendor: 'Ubiquiti Inc.', device: 'UniFi Protect Camera' },
  { name: 'roku-bedroom', isWired: false, baseDown: 9_000_000, baseUp: 100_000, vendor: 'Roku, Inc.', device: 'Roku Streaming Stick' },
  { name: 'switch-lite', isWired: false, baseDown: 800_000, baseUp: 60_000, vendor: 'Nintendo Co., Ltd.', device: 'Nintendo Switch Lite' },
  { name: 'ring-doorbell', isWired: false, baseDown: 40_000, baseUp: 380_000, vendor: 'Amazon Technologies Inc.', device: 'Ring Doorbell' },
  { name: 'echo-kitchen', isWired: false, baseDown: 30_000, baseUp: 12_000, vendor: 'Amazon Technologies Inc.', device: 'Echo Dot' },
  { name: 'hue-bridge', isWired: true, baseDown: 8_000, baseUp: 4_000, vendor: 'Philips Lighting BV', device: 'Hue Bridge' },
  { name: 'pihole-pi', isWired: true, baseDown: 100_000, baseUp: 50_000, vendor: 'Raspberry Pi Foundation', device: 'Raspberry Pi' },
];

const DPI_CATEGORY_FIXTURES = [
  { name: 'Streaming', weight: 62 },
  { name: 'Web', weight: 14 },
  { name: 'Games', weight: 9 },
  { name: 'Social', weight: 6 },
  { name: 'Cloud', weight: 4 },
  { name: 'Conferencing', weight: 3 },
  { name: 'Update Tools', weight: 2 },
];

const DPI_APP_FIXTURES = [
  { name: 'YouTube', weight: 28 },
  { name: 'Netflix', weight: 22 },
  { name: 'iCloud', weight: 12 },
  { name: 'SSL/TLS', weight: 10 },
  { name: 'Zoom', weight: 7 },
  { name: 'Discord', weight: 5 },
  { name: 'Steam', weight: 4 },
  { name: 'GitHub', weight: 3 },
];

type WanState = { rxTotal: number; txTotal: number; phaseOffset: number; baseRx: number; baseTx: number; ifName: string; ip: string };
const WANS: WanState[] = [
  { rxTotal: 1_200_000_000_000, txTotal: 180_000_000_000, phaseOffset: 0, baseRx: 60_000_000, baseTx: 4_000_000, ifName: 'eth9', ip: '203.0.113.42' },
  { rxTotal: 600_000_000_000, txTotal: 80_000_000_000, phaseOffset: 3.7, baseRx: 28_000_000, baseTx: 2_000_000, ifName: 'eth10', ip: '198.51.100.7' },
];
let phase = 0;

function noise(amp: number): number {
  return (Math.random() - 0.5) * amp;
}

function envelope(t: number): number {
  return 0.65 + 0.25 * Math.sin(t / 9.7) + 0.15 * Math.sin(t / 3.3 + 1.1) + 0.1 * Math.sin(t / 1.7);
}

export function mockWans(intervalMs = 2000): Wan[] {
  phase += intervalMs / 1000;
  return WANS.map((w, i) => {
    const env = envelope(phase + w.phaseOffset);
    const rx = Math.max(0, w.baseRx * env + noise(w.baseRx * 0.25));
    const tx = Math.max(0, w.baseTx * env + noise(w.baseTx * 0.25));
    w.rxTotal += (rx * intervalMs) / 1000;
    w.txTotal += (tx * intervalMs) / 1000;
    return {
      id: `wan${i + 1}`,
      ifIndex: i + 3,
      ifName: w.ifName,
      label: `WAN ${i + 1}`,
      speedBitsPerSec: 10_000_000_000,
      rxBps: rx,
      txBps: tx,
      rxTotal: w.rxTotal,
      txTotal: w.txTotal,
      wanIp: w.ip,
      status: 'ok',
      latencyMs: 6 + Math.random() * 6 + i * 4,
    };
  });
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
      vendor: c.vendor ?? null,
      device: c.device ?? null,
      firstSeen: Math.floor(Date.now() / 1000) - 86400 - i * 3600,
      lastSeen: Math.floor(Date.now() / 1000),
    };
  });
}

export function mockDpi(): { apps: DpiCategory[]; categories: DpiCategory[] } {
  const build = (fixtures: { name: string; weight: number }[], prefix: string) => {
    const totalWeight = fixtures.reduce((a, b) => a + b.weight, 0);
    return fixtures.map((d, i) => ({
      id: `${prefix}-${i}`,
      name: d.name,
      bytes: d.weight * 100_000_000_000,
      pct: d.weight / totalWeight,
    }));
  };
  return {
    apps: build(DPI_APP_FIXTURES, 'mock-app'),
    categories: build(DPI_CATEGORY_FIXTURES, 'mock-cat'),
  };
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
