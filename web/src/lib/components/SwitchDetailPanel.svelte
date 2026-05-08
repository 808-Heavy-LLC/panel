<script lang="ts">
  import { onMount } from 'svelte';
  import { panel } from '$lib/store.svelte';
  import { formatBps, formatUptime } from '$lib/format';

  const PAGE_SIZE = 4;
  const GROUP_DWELL_MS = 12_000;

  // Stable order so the cycle doesn't reshuffle when bandwidth changes.
  const switches = $derived(
    panel.devices
      .filter((d) => d.type === 'usw')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const groupCount = $derived(Math.max(1, Math.ceil(switches.length / PAGE_SIZE)));
  let cursor = $state(0);
  const groupIdx = $derived(switches.length === 0 ? 0 : cursor % groupCount);
  const group = $derived(
    switches.slice(groupIdx * PAGE_SIZE, groupIdx * PAGE_SIZE + PAGE_SIZE),
  );

  onMount(() => {
    const t = window.setInterval(() => (cursor += 1), GROUP_DWELL_MS);
    return () => window.clearInterval(t);
  });

  function fmtSpeed(mbps: number): string {
    if (mbps >= 1000) return `${mbps / 1000}G`;
    if (mbps >= 1) return `${mbps}M`;
    return '—';
  }
</script>

{#if switches.length === 0}
  <div class="grid h-full place-items-center text-[12px] uppercase tracking-widest text-[var(--c-text-dim)]">
    No switches reporting…
  </div>
{:else}
  <div class="sw-grid h-full">
    {#each group as sw (sw.id)}
      {@const fmtTotal = formatBps(sw.bytesRate)}
      {@const upPorts = sw.ports.filter((p) => p.up).length}
      {@const poeWatts = sw.ports.reduce((s, p) => s + (p.poeWatts || 0), 0)}
      <div class="sw-card">
        <header class="card-head">
          <span class="state-dot" class:up={sw.state === 1}></span>
          <div class="name-stack min-w-0">
            <span class="name truncate">{sw.name}</span>
            <span class="meta truncate">
              {sw.model} · {upPorts}/{sw.ports.length} ports · UP {formatUptime(sw.uptimeSec)}
            </span>
          </div>
          <div class="head-stats">
            <div class="stat">
              <span class="stat-label">FABRIC</span>
              <span class="stat-val hud-value-primary">
                {fmtTotal.value}<span class="stat-unit"> {fmtTotal.unit}</span>
              </span>
            </div>
            {#if poeWatts > 0}
              <div class="stat">
                <span class="stat-label">POE</span>
                <span class="stat-val hud-value-secondary">
                  {poeWatts.toFixed(0)}<span class="stat-unit"> W</span>
                </span>
              </div>
            {/if}
          </div>
        </header>

        <div class="port-grid">
          {#each sw.ports as p (p.idx)}
            {@const r = formatBps(p.rxBps + p.txBps)}
            <div class="port" class:up={p.up} class:uplink={p.isUplink} class:poe={p.poeWatts > 0}>
              <div class="port-head">
                <span class="port-idx">{p.idx}</span>
                <span class="port-speed">{p.up ? fmtSpeed(p.speedMbps) : '—'}</span>
              </div>
              {#if p.up}
                <div class="port-rate">{r.value}<span class="rate-unit"> {r.unit}</span></div>
              {:else}
                <div class="port-rate dim">DOWN</div>
              {/if}
              {#if p.neighbor}
                <div class="port-neighbor truncate" title={p.neighbor.systemName ?? p.neighbor.chassisId}>
                  ↳ {p.neighbor.systemName ?? p.neighbor.chassisId.slice(0, 8) + '…'}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .sw-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: minmax(0, 1fr);
    gap: 10px;
    height: 100%;
  }
  .sw-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    border: 1px solid var(--c-line);
    border-left-width: 3px;
    border-left-color: var(--c-line-bright);
    background: color-mix(in oklab, var(--c-bg-panel-2) 55%, transparent);
    padding: 8px 10px;
    overflow: hidden;
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name-stack {
    display: flex;
    flex-direction: column;
    line-height: 1.18;
    flex: 1;
    min-width: 0;
  }
  .name {
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 600;
    color: var(--c-text-bright);
  }
  .meta {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-text-dim);
    letter-spacing: 0.04em;
  }
  .state-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-err);
    flex: 0 0 auto;
  }
  .state-dot.up {
    background: var(--c-ok);
    box-shadow: 0 0 calc(6px * var(--glow-mult)) var(--c-ok);
  }
  .head-stats {
    display: flex;
    gap: 12px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.1;
  }
  .stat-label {
    font-family: var(--font-display);
    font-size: 9px;
    letter-spacing: 0.12em;
    color: var(--c-text-dim);
  }
  .stat-val {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 600;
  }
  .stat-unit {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-text-dim);
    font-weight: 400;
  }
  .port-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 4px;
    flex: 1;
    min-height: 0;
    align-content: start;
    overflow: hidden;
  }
  .port {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 6px;
    border: 1px solid var(--c-line);
    border-left-width: 3px;
    border-left-color: var(--c-line);
    background: color-mix(in oklab, var(--c-bg-panel) 60%, transparent);
  }
  .port.up { border-left-color: var(--c-ok); }
  .port.up.uplink { border-left-color: var(--c-primary); }
  .port.up.poe:not(.uplink) { border-left-color: var(--c-secondary); }
  .port-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px;
  }
  .port-idx {
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    color: var(--c-text-bright);
  }
  .port-speed {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--c-text-dim);
  }
  .port-rate {
    font-family: var(--font-display);
    font-size: 11px;
    color: var(--c-primary);
    font-weight: 600;
  }
  .port-rate.dim {
    color: var(--c-text-dim);
    font-size: 10px;
    font-weight: 400;
  }
  .rate-unit {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--c-text-dim);
    font-weight: 400;
  }
  .port-neighbor {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--c-text-dim);
  }
</style>
