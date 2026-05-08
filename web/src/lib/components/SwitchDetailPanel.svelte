<script lang="ts">
  import { onMount } from 'svelte';
  import { panel } from '$lib/store.svelte';
  import { formatBps, formatUptime } from '$lib/format';

  const SWITCH_DWELL_MS = 7_000;

  // Stable order for sub-cycling (alphabetical by name) so the
  // sequence doesn't reshuffle when a device's bytesRate changes.
  const switches = $derived(
    panel.devices
      .filter((d) => d.type === 'usw')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  let cursor = $state(0);
  const idx = $derived(switches.length === 0 ? 0 : cursor % switches.length);
  const sw = $derived(switches[idx] ?? null);

  onMount(() => {
    const t = window.setInterval(() => (cursor += 1), SWITCH_DWELL_MS);
    return () => window.clearInterval(t);
  });

  function fmtSpeed(mbps: number): string {
    if (mbps >= 10_000) return `${mbps / 1000}G`;
    if (mbps >= 1000) return `${mbps / 1000}G`;
    if (mbps >= 1) return `${mbps}M`;
    return '—';
  }
</script>

{#if !sw}
  <div class="grid h-full place-items-center text-[11px] uppercase tracking-widest text-[var(--c-text-dim)]">
    No switches reporting…
  </div>
{:else}
  {@const fmtTotal = formatBps(sw.bytesRate)}
  {@const upPorts = sw.ports.filter((p) => p.up).length}
  {@const poeWatts = sw.ports.reduce((s, p) => s + (p.poeWatts || 0), 0)}
  {@const lldpPorts = sw.ports.filter((p) => p.neighbor).length}
  <div class="sd flex h-full flex-col gap-3 overflow-hidden text-[12px]">
    <!-- Header: switch identity + summary stats -->
    <header class="head">
      <div class="head-left min-w-0">
        <span class="state-dot" class:up={sw.state === 1}></span>
        <div class="name-stack min-w-0">
          <span class="name truncate">{sw.name}</span>
          <span class="meta truncate">
            {sw.model} · {sw.ip ?? '—'} · UP {formatUptime(sw.uptimeSec)}
          </span>
        </div>
      </div>
      <div class="head-right">
        <div class="stat">
          <span class="stat-label">FABRIC</span>
          <span class="stat-val hud-value-primary">{fmtTotal.value}<span class="stat-unit"> {fmtTotal.unit}</span></span>
        </div>
        <div class="stat">
          <span class="stat-label">PORTS UP</span>
          <span class="stat-val">{upPorts}<span class="stat-unit">/{sw.ports.length}</span></span>
        </div>
        <div class="stat">
          <span class="stat-label">POE</span>
          <span class="stat-val hud-value-secondary">{poeWatts.toFixed(0)}<span class="stat-unit"> W</span></span>
        </div>
        <div class="stat">
          <span class="stat-label">LLDP</span>
          <span class="stat-val">{lldpPorts}</span>
        </div>
      </div>
    </header>

    <!-- Port grid -->
    <div class="port-grid min-h-0 flex-1 overflow-hidden">
      {#each sw.ports as p (p.idx)}
        {@const r = formatBps((p.rxBps + p.txBps) * 8 / 8)}
        {@const isLive = p.up}
        <div class="port" class:up={isLive} class:uplink={p.isUplink} class:poe={p.poeWatts > 0}>
          <div class="port-head">
            <span class="port-idx">{p.idx}</span>
            <span class="port-speed">{isLive ? fmtSpeed(p.speedMbps) : '—'}</span>
          </div>
          <div class="port-name truncate">{p.name}</div>
          {#if isLive}
            <div class="port-rate">
              <span class="rate-val">{r.value}</span>
              <span class="rate-unit"> {r.unit}</span>
            </div>
          {:else}
            <div class="port-rate dim">DOWN</div>
          {/if}
          {#if p.poeWatts > 0}
            <div class="port-poe">PoE · {p.poeWatts.toFixed(1)} W</div>
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
{/if}

<style>
  .sd {
    padding: 2px 4px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .head-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .name-stack {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .name {
    font-family: var(--font-display);
    font-size: 16px;
    letter-spacing: 0.05em;
    color: var(--c-text-bright);
  }
  .meta {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--c-text-dim);
  }
  .state-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c-err);
  }
  .state-dot.up {
    background: var(--c-ok);
    box-shadow: 0 0 calc(8px * var(--glow-mult)) var(--c-ok);
  }
  .head-right {
    display: flex;
    gap: 18px;
    align-items: baseline;
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
    letter-spacing: 0.16em;
    color: var(--c-text-dim);
  }
  .stat-val {
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--c-text-bright);
    line-height: 1;
  }
  .stat-unit {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-text-dim);
  }
  .port-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 6px;
    align-content: start;
  }
  .port {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    border: 1px solid var(--c-line);
    border-left-width: 3px;
    border-left-color: var(--c-line);
    background: color-mix(in oklab, var(--c-bg-panel-2) 60%, transparent);
  }
  .port.up {
    border-left-color: var(--c-ok);
  }
  .port.up.uplink {
    border-left-color: var(--c-primary);
  }
  .port.up.poe:not(.uplink) {
    border-left-color: var(--c-secondary);
  }
  .port-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .port-idx {
    font-family: var(--font-display);
    font-size: 14px;
    color: var(--c-text-bright);
  }
  .port-speed {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--c-text-dim);
  }
  .port-name {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-text);
    letter-spacing: 0.04em;
  }
  .port-rate {
    font-family: var(--font-display);
    font-size: 12px;
    color: var(--c-primary);
  }
  .port-rate.dim {
    color: var(--c-text-dim);
    font-size: 10px;
  }
  .rate-unit {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--c-text-dim);
  }
  .port-poe {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--c-secondary);
    letter-spacing: 0.04em;
  }
  .port-neighbor {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--c-text-dim);
  }
</style>
