<script lang="ts">
  import { panel } from '$lib/store.svelte';
  import { formatBps } from '$lib/format';

  const switches = $derived(
    panel.devices
      .filter((d) => d.type === 'usw')
      .slice()
      .sort((a, b) => b.bytesRate - a.bytesRate),
  );
</script>

<ul class="flex h-full flex-col gap-1.5 overflow-hidden text-[12px]">
  {#each switches as sw (sw.id)}
    {@const fmt = formatBps(sw.bytesRate)}
    {@const upPorts = sw.ports.filter((p) => p.up).length}
    {@const totalPorts = sw.ports.length}
    {@const poeWatts = sw.ports.reduce((s, p) => s + (p.poeWatts || 0), 0)}
    {@const portFill = totalPorts > 0 ? (upPorts / totalPorts) * 100 : 0}
    <li class="sw-row">
      <div class="row-head">
        <span class="state-dot" class:up={sw.state === 1}></span>
        <span class="name-stack min-w-0">
          <span class="name truncate">{sw.name}</span>
          <span class="meta truncate">
            {sw.model} · {upPorts}/{totalPorts} ports{poeWatts > 0 ? ` · ${poeWatts.toFixed(0)}W PoE` : ''}
          </span>
        </span>
        <span class="totals text-[var(--c-text-dim)]">
          <span class="hud-value-primary">{fmt.value}</span><span class="ml-0.5">{fmt.unit}</span>
        </span>
      </div>
      <div class="port-grid" title="{upPorts} of {totalPorts} ports up">
        {#each sw.ports as p}
          <span class="port" class:up={p.up} class:uplink={p.isUplink} class:poe={p.poeWatts > 0} title="Port {p.idx} {p.up ? p.speedMbps + 'M' : 'down'}{p.poeWatts > 0 ? ' · ' + p.poeWatts.toFixed(1) + 'W' : ''}"></span>
        {/each}
      </div>
    </li>
  {/each}
  {#if switches.length === 0}
    <li class="grid h-full place-items-center text-[var(--c-text-dim)] uppercase tracking-widest text-[11px]">
      No switches reporting…
    </li>
  {/if}
</ul>

<style>
  .sw-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 6px;
    border-left: 2px solid var(--c-line);
  }
  .row-head {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    gap: 8px;
    align-items: baseline;
    font-size: 12px;
  }
  .name-stack {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .name {
    color: var(--c-text-bright);
  }
  .meta {
    font-size: 10px;
    color: var(--c-text-dim);
    letter-spacing: 0.06em;
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
  .totals {
    font-size: 10px;
    white-space: nowrap;
  }
  .port-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding-top: 2px;
  }
  .port {
    width: 10px;
    height: 6px;
    background: var(--c-line);
    border: 1px solid var(--c-line-bright);
  }
  .port.up {
    background: var(--c-ok);
    box-shadow: 0 0 calc(3px * var(--glow-mult)) var(--c-ok);
  }
  .port.uplink {
    background: var(--c-primary);
    box-shadow: 0 0 calc(4px * var(--glow-mult)) var(--c-primary);
  }
  .port.poe {
    border-color: var(--c-secondary);
  }
</style>
