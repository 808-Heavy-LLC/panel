<script lang="ts">
  import { onMount } from 'svelte';
  import { panel } from '$lib/store.svelte';
  import { formatBps, formatUptime } from '$lib/format';

  const PAGE_SIZE = 8;
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
              {sw.model} · {upPorts}/{sw.ports.length} · {formatUptime(sw.uptimeSec)}
            </span>
          </div>
          <div class="head-stats">
            <span class="stat-val hud-value-primary">
              {fmtTotal.value}<span class="stat-unit">{fmtTotal.unit}</span>
            </span>
            {#if poeWatts > 0}
              <span class="stat-val hud-value-secondary">
                {poeWatts.toFixed(0)}<span class="stat-unit">W</span>
              </span>
            {/if}
          </div>
        </header>

        <div class="port-grid">
          {#each sw.ports as p (p.idx)}
            {@const r = formatBps(p.rxBps + p.txBps)}
            <div class="port" class:up={p.up} class:uplink={p.isUplink} class:poe={p.poeWatts > 0}
                 title={p.neighbor ? `${p.neighbor.systemName ?? p.neighbor.chassisId} · ${p.idx}` : `Port ${p.idx}`}>
              <span class="port-idx">{p.idx}</span>
              {#if p.up}
                <span class="port-rate">{r.value}<span class="rate-unit">{r.unit}</span></span>
                <span class="port-speed">{fmtSpeed(p.speedMbps)}</span>
              {:else}
                <span class="port-rate dim">—</span>
                <span class="port-speed">DN</span>
              {/if}
              {#if p.poeWatts > 0 || p.neighbor}
                <span class="port-aux truncate">
                  {#if p.neighbor}↳ {p.neighbor.systemName ?? p.neighbor.chassisId.slice(0, 8)}{:else}{p.poeWatts.toFixed(1)}W{/if}
                </span>
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    gap: 6px;
    height: 100%;
  }
  .sw-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    border: 1px solid var(--c-line);
    border-left-width: 3px;
    border-left-color: var(--c-line-bright);
    background: color-mix(in oklab, var(--c-bg-panel-2) 55%, transparent);
    padding: 5px 7px;
    overflow: hidden;
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .name-stack {
    display: flex;
    flex-direction: column;
    line-height: 1.12;
    flex: 1;
    min-width: 0;
  }
  .name {
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    color: var(--c-text-bright);
  }
  .meta {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--c-text-dim);
    letter-spacing: 0.04em;
  }
  .state-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c-err);
    flex: 0 0 auto;
  }
  .state-dot.up {
    background: var(--c-ok);
    box-shadow: 0 0 calc(5px * var(--glow-mult)) var(--c-ok);
  }
  .head-stats {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .stat-val {
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  }
  .stat-unit {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--c-text-dim);
    font-weight: 400;
    margin-left: 1px;
  }
  .port-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
    gap: 2px;
    flex: 1;
    min-height: 0;
    align-content: start;
    overflow: hidden;
  }
  .port {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    gap: 0 4px;
    padding: 2px 4px;
    border: 1px solid var(--c-line);
    border-left-width: 2px;
    border-left-color: var(--c-line);
    background: color-mix(in oklab, var(--c-bg-panel) 60%, transparent);
    line-height: 1.1;
    min-width: 0;
    overflow: hidden;
  }
  .port.up { border-left-color: var(--c-ok); }
  .port.up.uplink { border-left-color: var(--c-primary); }
  .port.up.poe:not(.uplink) { border-left-color: var(--c-secondary); }
  .port-idx {
    grid-row: 1;
    grid-column: 1;
    font-family: var(--font-display);
    font-size: 10px;
    font-weight: 600;
    color: var(--c-text-bright);
  }
  .port-speed {
    grid-row: 1;
    grid-column: 2;
    font-family: var(--font-mono);
    font-size: 8px;
    color: var(--c-text-dim);
    text-align: right;
    align-self: baseline;
  }
  .port-rate {
    grid-row: 2;
    grid-column: 1 / 3;
    font-family: var(--font-display);
    font-size: 10px;
    color: var(--c-primary);
    font-weight: 600;
    line-height: 1.05;
  }
  .port-rate.dim {
    color: var(--c-text-dim);
    font-weight: 400;
  }
  .rate-unit {
    font-family: var(--font-mono);
    font-size: 8px;
    color: var(--c-text-dim);
    font-weight: 400;
    margin-left: 1px;
  }
  .port-aux {
    grid-row: 3;
    grid-column: 1 / 3;
    font-family: var(--font-mono);
    font-size: 8px;
    color: var(--c-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
