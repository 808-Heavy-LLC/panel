<script lang="ts">
  import { panel } from '$lib/store.svelte';
  import { formatBytes, formatUptime } from '$lib/format';
  import type { HealthSubsystem } from '$lib/types';

  const www = $derived(panel.health.find((h) => h.name === 'www') ?? null);
  const wanHealths = $derived(panel.health.filter((h) => h.name.startsWith('wan')));

  // Latency sparkline: pull from the first WAN's history (which we
  // populate with the www latency). Falls back to empty when no
  // history yet (e.g. fresh boot).
  const latencyHistory = $derived.by(() => {
    const firstWan = panel.wans[0];
    if (!firstWan) return [] as number[];
    const samples = panel.histories[firstWan.id] ?? [];
    return samples
      .map((s) => s.latencyMs)
      .filter((v): v is number => v !== null && Number.isFinite(v));
  });

  const sparkPath = $derived.by(() => {
    const xs = latencyHistory;
    if (xs.length < 2) return '';
    const max = Math.max(...xs, 1);
    const min = Math.min(...xs, 0);
    const range = Math.max(1, max - min);
    const w = 100;
    const h = 30;
    return xs
      .map((v, i) => {
        const x = (i / (xs.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  });

  function formatStLastRun(ts: number | null): string {
    if (!ts) return 'never';
    const ageSec = Math.max(0, Date.now() / 1000 - ts);
    if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
    if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
    return `${Math.floor(ageSec / 86400)}d ago`;
  }

  function formatSpeed(mbps: number | null): string {
    if (mbps == null) return '—';
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
    return `${mbps.toFixed(0)} Mbps`;
  }

  function fmtMonth(label: string): string {
    const [y, m] = label.split('-');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const idx = Number.parseInt(m ?? '0', 10) - 1;
    return idx >= 0 && idx < 12 ? `${months[idx]} ${y}` : label;
  }

  function bytesText(b: number): string {
    const f = formatBytes(b);
    return `${f.value} ${f.unit}`;
  }

  // Pick the icmp probe whose target matches a well-known site. Returns
  // null when the monitor list is empty (fresh uplink) or no match.
  function findProbe(monitors: HealthSubsystem['monitors'], match: (t: string) => boolean): number | null {
    const p = monitors.find((m) => m.type === 'icmp' && match(m.target.toLowerCase()));
    return p?.latencyMs ?? null;
  }

  function probesFor(h: HealthSubsystem | null): { ms: number | null; google: number | null; cf: number | null } {
    if (!h) return { ms: null, google: null, cf: null };
    return {
      ms: findProbe(h.monitors, (t) => t.includes('microsoft')),
      google: findProbe(h.monitors, (t) => t.includes('google')),
      cf: findProbe(h.monitors, (t) => t === '1.1.1.1' || t.includes('cloudflare')),
    };
  }
</script>

<div class="ih flex h-full flex-col gap-3 text-[12px]">
  <!-- Top: latency big number + sparkline -->
  <div class="block">
    <div class="row-head">
      <span class="label">INTERNET LATENCY</span>
      <span class="status" class:ok={www?.status === 'ok'} class:warn={www?.status === 'warning'} class:err={www && www.status !== 'ok' && www.status !== 'warning'}>
        {www?.status ? www.status.toUpperCase() : 'UNKNOWN'}
      </span>
    </div>
    <div class="latency-row">
      <span class="latency-val">
        {www?.latencyMs ?? '—'}
      </span>
      <span class="latency-unit">ms</span>
      {#if sparkPath}
        <svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
          <path d={sparkPath} fill="none" stroke="var(--c-primary)" stroke-width="1.4" />
        </svg>
      {/if}
    </div>
    <div class="meta-row">
      <span>
        DROPS · <span class="hud-value-primary">{www?.drops ?? '—'}</span>
      </span>
      <span>
        UPTIME · <span class="hud-value-primary">{www?.uptimeSec ? formatUptime(www.uptimeSec) : '—'}</span>
      </span>
    </div>
  </div>

  <!-- Speedtest -->
  <div class="block">
    <div class="row-head">
      <span class="label">LAST SPEEDTEST</span>
      <span class="meta">{formatStLastRun(www?.speedtestLastRunTs ?? null)}</span>
    </div>
    <div class="st-row">
      <div class="st-cell">
        <span class="st-arrow">↓</span>
        <span class="st-val hud-value-primary">{formatSpeed(www?.xputDownMbps ?? null)}</span>
      </div>
      <div class="st-cell">
        <span class="st-arrow up">↑</span>
        <span class="st-val hud-value-secondary">{formatSpeed(www?.xputUpMbps ?? null)}</span>
      </div>
    </div>
  </div>

  <!-- Per-WAN cards -->
  <div class="block flex-1 min-h-0 overflow-y-auto wan-cards">
    {#each panel.wans as w, i (w.id)}
      {@const h = wanHealths[i] ?? null}
      {@const probes = probesFor(h)}
      {@const isOk = (h?.status ?? w.status) === 'ok'}
      <div class="wan-card">
        <div class="wan-head">
          <span class="state-dot" class:up={isOk}></span>
          <span class="wan-name">{h?.ispName ?? w.label}</span>
          {#if h?.asn != null}
            <span class="wan-asn">AS{h.asn}</span>
          {/if}
          {#if h?.availabilityPct != null}
            <span class="wan-avail">{h.availabilityPct.toFixed(h.availabilityPct === 100 ? 0 : 1)}%</span>
          {/if}
        </div>

        <dl class="wan-grid">
          <dt>IPv4</dt>
          <dd class="mono">{w.wanIp ?? h?.wanIp ?? '—'}</dd>

          {#if w.wanIpv6}
            <dt>IPv6</dt>
            <dd class="mono truncate" title={w.wanIpv6}>{w.wanIpv6}</dd>
          {/if}

          <dt>Used · {fmtMonth(w.monthLabel)}</dt>
          <dd>
            <span class="hud-value-primary">↓ {bytesText(w.monthRxBytes)}</span>
            <span class="sep"> · </span>
            <span class="hud-value-secondary">↑ {bytesText(w.monthTxBytes)}</span>
          </dd>

          {#if h?.uptimeSec}
            <dt>Uptime</dt>
            <dd>{formatUptime(h.uptimeSec)}</dd>
          {/if}
        </dl>

        <div class="probe-row">
          <span class="probe" class:dim={probes.ms == null}>
            <span class="probe-tag">MS</span>
            <span class="probe-val">{probes.ms ?? '—'}<span class="probe-unit">ms</span></span>
          </span>
          <span class="probe" class:dim={probes.google == null}>
            <span class="probe-tag">GOOGL</span>
            <span class="probe-val">{probes.google ?? '—'}<span class="probe-unit">ms</span></span>
          </span>
          <span class="probe" class:dim={probes.cf == null}>
            <span class="probe-tag">CF</span>
            <span class="probe-val">{probes.cf ?? '—'}<span class="probe-unit">ms</span></span>
          </span>
        </div>
      </div>
    {/each}
    {#if panel.wans.length === 0}
      <div class="grid place-items-center py-2 text-[var(--c-text-dim)] text-[11px]">No WANs reporting…</div>
    {/if}
  </div>
</div>

<style>
  .ih {
    padding: 2px 4px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .label {
    font-family: var(--font-display);
    font-size: 10px;
    letter-spacing: 0.18em;
    color: var(--c-text-dim);
  }
  .status {
    font-family: var(--font-display);
    font-size: 10px;
    letter-spacing: 0.18em;
    color: var(--c-text-dim);
  }
  .status.ok { color: var(--c-ok); text-shadow: 0 0 calc(6px * var(--glow-mult)) color-mix(in oklab, var(--c-ok) 45%, transparent); }
  .status.warn { color: var(--c-warn); }
  .status.err { color: var(--c-err); }
  .meta {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-text-dim);
  }
  .latency-row {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: 6px;
  }
  .latency-val {
    font-family: var(--font-display);
    font-size: 36px;
    color: var(--c-primary);
    text-shadow: 0 0 calc(14px * var(--glow-mult)) color-mix(in oklab, var(--c-primary) 60%, transparent);
    line-height: 1;
  }
  .latency-unit {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--c-text-dim);
  }
  .spark {
    width: 100%;
    height: 30px;
    align-self: center;
  }
  .meta-row {
    display: flex;
    gap: 16px;
    font-size: 10px;
    color: var(--c-text-dim);
    letter-spacing: 0.06em;
  }
  .st-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .st-cell {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .st-arrow {
    font-size: 16px;
    color: var(--c-primary);
  }
  .st-arrow.up {
    color: var(--c-secondary);
  }
  .st-val {
    font-family: var(--font-display);
    font-size: 18px;
    line-height: 1;
  }

  .wan-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .wan-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
    border-left: 2px solid var(--c-line);
    background: color-mix(in oklab, var(--c-line) 12%, transparent);
  }
  .wan-head {
    display: grid;
    grid-template-columns: 10px 1fr auto auto;
    gap: 8px;
    align-items: baseline;
  }
  .wan-name {
    color: var(--c-text-bright);
    font-family: var(--font-display);
    font-size: 12px;
    letter-spacing: 0.06em;
  }
  .wan-asn {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-text-dim);
  }
  .wan-avail {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-ok);
  }
  .state-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-err);
    align-self: center;
  }
  .state-dot.up {
    background: var(--c-ok);
    box-shadow: 0 0 calc(6px * var(--glow-mult)) var(--c-ok);
  }
  .wan-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 0;
    font-size: 10.5px;
  }
  .wan-grid dt {
    color: var(--c-text-dim);
    font-family: var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 9.5px;
    align-self: baseline;
  }
  .wan-grid dd {
    margin: 0;
    color: var(--c-text);
    min-width: 0;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 10.5px;
  }
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sep {
    color: var(--c-text-dim);
    margin: 0 4px;
  }
  .probe-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 4px;
  }
  .probe {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px;
    align-items: baseline;
    padding: 2px 6px;
    border: 1px solid var(--c-line);
    border-radius: 2px;
    background: color-mix(in oklab, var(--c-bg) 30%, transparent);
  }
  .probe.dim {
    opacity: 0.4;
  }
  .probe-tag {
    font-family: var(--font-display);
    font-size: 9px;
    letter-spacing: 0.12em;
    color: var(--c-text-dim);
  }
  .probe-val {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--c-primary);
    text-align: right;
  }
  .probe-unit {
    font-size: 9px;
    color: var(--c-text-dim);
    margin-left: 2px;
  }
</style>
