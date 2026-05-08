<script lang="ts">
  import { panel } from '$lib/store.svelte';
  import { formatUptime } from '$lib/format';

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

  <!-- Per-WAN status -->
  <div class="block flex-1 min-h-0 overflow-hidden">
    <div class="row-head">
      <span class="label">WAN STATUS</span>
    </div>
    <ul class="wan-list">
      {#each panel.wans as w, i (w.id)}
        {@const h = wanHealths[i] ?? wanHealths[0] ?? null}
        <li class="wan-row">
          <span class="state-dot" class:up={(h?.status ?? w.status) === 'ok'}></span>
          <span class="wan-name truncate">{w.label}</span>
          <span class="wan-meta truncate">
            {w.wanIp ?? h?.wanIp ?? '—'}
          </span>
          <span class="wan-up">
            {h?.uptimeSec ? formatUptime(h.uptimeSec) : '—'}
          </span>
        </li>
      {/each}
      {#if panel.wans.length === 0}
        <li class="grid place-items-center py-2 text-[var(--c-text-dim)] text-[11px]">No WANs reporting…</li>
      {/if}
    </ul>
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
  .wan-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .wan-row {
    display: grid;
    grid-template-columns: 10px 1fr 1.2fr auto;
    gap: 8px;
    align-items: baseline;
    padding: 3px 6px;
    border-left: 2px solid var(--c-line);
    font-size: 11px;
  }
  .wan-name {
    color: var(--c-text-bright);
  }
  .wan-meta {
    font-family: var(--font-mono);
    color: var(--c-text-dim);
    font-size: 10px;
  }
  .wan-up {
    font-family: var(--font-mono);
    color: var(--c-text);
    font-size: 10px;
    white-space: nowrap;
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
</style>
