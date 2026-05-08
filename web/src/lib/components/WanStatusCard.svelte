<script lang="ts">
  import { panel } from '$lib/store.svelte';
  import { formatBytes, formatUptime } from '$lib/format';
  import type { HealthSubsystem } from '$lib/types';

  interface Props {
    wanId: string;
  }
  const { wanId }: Props = $props();

  const wan = $derived(panel.wans.find((w) => w.id === wanId) ?? null);
  // Per-WAN health entry comes from the fanned-out /stat/health -> wan/wan2.
  // Fall back to www for the single-WAN setup so metrics aren't blank.
  const health = $derived<HealthSubsystem | null>(
    panel.health.find((h) => h.name === wanId) ??
      panel.health.find((h) => h.name === 'wan') ??
      panel.health.find((h) => h.name === 'www') ??
      null,
  );
  const www = $derived(panel.health.find((h) => h.name === 'www') ?? null);

  const latencyHistory = $derived.by(() => {
    if (!wan) return [] as number[];
    const samples = panel.histories[wan.id] ?? [];
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
    return xs
      .map((v, i) => {
        const x = (i / (xs.length - 1)) * 100;
        const y = 24 - ((v - min) / range) * 24;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  });

  function findProbe(monitors: HealthSubsystem['monitors'], match: (t: string) => boolean): number | null {
    const p = monitors.find((m) => m.type === 'icmp' && match(m.target.toLowerCase()));
    return p?.latencyMs ?? null;
  }

  const probes = $derived.by(() => {
    const m = health?.monitors ?? [];
    return {
      ms: findProbe(m, (t) => t.includes('microsoft')),
      google: findProbe(m, (t) => t.includes('google')),
      cf: findProbe(m, (t) => t === '1.1.1.1' || t.includes('cloudflare')),
    };
  });

  function fmtBytes(b: number): string {
    const f = formatBytes(b);
    return `${f.value} ${f.unit}`;
  }

  function fmtSpeed(mbps: number | null): string {
    if (mbps == null) return '—';
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
    return `${Math.round(mbps)} Mbps`;
  }

  function fmtAge(ts: number | null): string {
    if (!ts) return 'never';
    const ageSec = Math.max(0, Date.now() / 1000 - ts);
    if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
    if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
    return `${Math.floor(ageSec / 86400)}d ago`;
  }

  function fmtMonth(label: string): string {
    const [y, m] = label.split('-');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const idx = Number.parseInt(m ?? '0', 10) - 1;
    return idx >= 0 && idx < 12 ? `${months[idx]} ${y}` : label;
  }
</script>

{#if !wan}
  <div class="grid h-full place-items-center text-[11px] uppercase tracking-widest text-[var(--c-text-dim)]">
    No data
  </div>
{:else}
  {@const isOk = (health?.status ?? wan.status) === 'ok'}
  {@const latency = health?.latencyMs ?? www?.latencyMs ?? null}
  {@const avail = health?.availabilityPct}
  {@const isPrimary = wanId === 'wan1'}
  {@const stXput = isPrimary ? www : null}
  <div class="card text-[12px]">
    <header class="head">
      <span class="state-dot" class:up={isOk}></span>
      <div class="title-stack min-w-0">
        <span class="name truncate">{health?.ispName ?? wan.label}</span>
        <span class="meta truncate">
          {#if health?.asn != null}AS{health.asn} · {/if}{wan.ifName}
          {#if avail != null} · {avail.toFixed(avail === 100 ? 0 : 1)}%{/if}
        </span>
      </div>
      <div class="latency-stack">
        <div class="latency-row">
          <span class="latency-val">{latency ?? '—'}</span>
          <span class="latency-unit">ms</span>
        </div>
        {#if sparkPath}
          <svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none">
            <path d={sparkPath} fill="none" stroke="var(--c-primary)" stroke-width="1.4" />
          </svg>
        {/if}
      </div>
    </header>

    <dl class="grid">
      <dt>IPv4</dt>
      <dd class="mono">{wan.wanIp ?? '—'}</dd>

      <dt>IPv6</dt>
      <dd class="mono truncate" title={wan.wanIpv6 ?? ''}>{wan.wanIpv6 ?? '—'}</dd>

      <dt>Used · {fmtMonth(wan.monthLabel)}</dt>
      <dd>
        <span class="hud-value-primary">↓ {fmtBytes(wan.monthRxBytes)}</span>
        <span class="sep">·</span>
        <span class="hud-value-secondary">↑ {fmtBytes(wan.monthTxBytes)}</span>
      </dd>

      {#if health?.uptimeSec}
        <dt>Uptime</dt>
        <dd>{formatUptime(health.uptimeSec)}</dd>
      {/if}
    </dl>

    <div class="probe-row">
      <span class="probe" class:dim={probes.ms == null}>
        <span class="probe-tag">MS</span>
        <span class="probe-val">{probes.ms ?? '—'}<span class="probe-unit">ms</span></span>
      </span>
      <span class="probe" class:dim={probes.google == null}>
        <span class="probe-tag">GOOG</span>
        <span class="probe-val">{probes.google ?? '—'}<span class="probe-unit">ms</span></span>
      </span>
      <span class="probe" class:dim={probes.cf == null}>
        <span class="probe-tag">CF</span>
        <span class="probe-val">{probes.cf ?? '—'}<span class="probe-unit">ms</span></span>
      </span>
    </div>

    {#if isPrimary && stXput}
      <div class="speedtest-row">
        <span class="probe-tag">SPEEDTEST · {fmtAge(stXput.speedtestLastRunTs)}</span>
        <span class="st-vals">
          <span class="hud-value-primary">↓ {fmtSpeed(stXput.xputDownMbps)}</span>
          <span class="sep">·</span>
          <span class="hud-value-secondary">↑ {fmtSpeed(stXput.xputUpMbps)}</span>
        </span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    padding: 4px 6px;
  }
  .head {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    gap: 10px;
    align-items: center;
  }
  .title-stack {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .name {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 600;
    color: var(--c-text-bright);
    letter-spacing: 0.04em;
  }
  .meta {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-text-dim);
    letter-spacing: 0.04em;
  }
  .state-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--c-err);
  }
  .state-dot.up {
    background: var(--c-ok);
    box-shadow: 0 0 calc(6px * var(--glow-mult)) var(--c-ok);
  }
  .latency-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 100px;
  }
  .latency-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    line-height: 1;
  }
  .latency-val {
    font-family: var(--font-display);
    font-size: 28px;
    color: var(--c-primary);
    text-shadow: 0 0 calc(10px * var(--glow-mult)) color-mix(in oklab, var(--c-primary) 60%, transparent);
  }
  .latency-unit {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-text-dim);
  }
  .spark {
    width: 100%;
    height: 22px;
    margin-top: 1px;
  }
  .grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 0;
    font-size: 11px;
  }
  .grid dt {
    color: var(--c-text-dim);
    font-family: var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 9.5px;
    align-self: baseline;
  }
  .grid dd {
    margin: 0;
    color: var(--c-text);
    min-width: 0;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 11px;
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
    padding: 3px 7px;
    border: 1px solid var(--c-line);
    background: color-mix(in oklab, var(--c-bg) 30%, transparent);
  }
  .probe.dim { opacity: 0.4; }
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
  .speedtest-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 2px 4px;
    border-top: 1px solid var(--c-line);
    padding-top: 6px;
    margin-top: auto;
  }
  .st-vals {
    font-family: var(--font-display);
    font-size: 12px;
  }
</style>
