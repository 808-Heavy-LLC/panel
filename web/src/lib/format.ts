export function formatBps(bps: number): { value: string; unit: string } {
  const bits = bps * 8;
  if (bits >= 1e9) return { value: (bits / 1e9).toFixed(2), unit: 'Gbps' };
  if (bits >= 1e6) return { value: (bits / 1e6).toFixed(1), unit: 'Mbps' };
  if (bits >= 1e3) return { value: (bits / 1e3).toFixed(0), unit: 'Kbps' };
  return { value: bits.toFixed(0), unit: 'bps' };
}

export function formatBytes(bytes: number): { value: string; unit: string } {
  if (bytes >= 1e12) return { value: (bytes / 1e12).toFixed(2), unit: 'TB' };
  if (bytes >= 1e9) return { value: (bytes / 1e9).toFixed(2), unit: 'GB' };
  if (bytes >= 1e6) return { value: (bytes / 1e6).toFixed(1), unit: 'MB' };
  if (bytes >= 1e3) return { value: (bytes / 1e3).toFixed(0), unit: 'KB' };
  return { value: bytes.toFixed(0), unit: 'B' };
}

export function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatClock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatDate(d: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${pad2(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
