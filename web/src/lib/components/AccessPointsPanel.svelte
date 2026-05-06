<script lang="ts">
  import { panel } from '$lib/store.svelte';
  import { formatBps } from '$lib/format';

  const aps = $derived(
    panel.devices
      .filter((d) => d.type === 'uap')
      .slice()
      .sort((a, b) => b.numClients - a.numClients),
  );
</script>

<ul class="flex h-full flex-col gap-1.5 overflow-hidden text-[12px]">
  {#each aps as ap (ap.id)}
    {@const fmt = formatBps(ap.bytesRate)}
    {@const sat = Math.max(0, Math.min(100, ap.satisfaction))}
    {@const totalRadioClients = ap.radios.reduce((s, r) => s + r.numClients, 0)}
    <li class="ap-row">
      <div class="row-head">
        <span class="state-dot" class:up={ap.state === 1}></span>
        <span class="name-stack min-w-0">
          <span class="name truncate">{ap.name}</span>
          <span class="meta truncate">{ap.model} · {ap.numClients || totalRadioClients} clients</span>
        </span>
        <span class="bands">
          {#each ap.radios as r}
            <span class="band band-{r.band}" title="ch{r.channel} · {r.numClients} clients · {r.utilizationPct}%">
              {r.band === '2g' ? '2.4' : r.band === '5g' ? '5' : '6'}
            </span>
          {/each}
        </span>
        <span class="totals text-[var(--c-text-dim)]">
          <span class="hud-value-primary">{fmt.value}</span><span class="ml-0.5">{fmt.unit}</span>
        </span>
      </div>
      <div class="bar-track" title="Satisfaction {sat}%">
        <div class="bar-fill" style="width: {sat}%"></div>
      </div>
    </li>
  {/each}
  {#if aps.length === 0}
    <li class="grid h-full place-items-center text-[var(--c-text-dim)] uppercase tracking-widest text-[11px]">
      No access points reporting…
    </li>
  {/if}
</ul>

<style>
  .ap-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 6px;
    border-left: 2px solid var(--c-line);
  }
  .row-head {
    display: grid;
    grid-template-columns: 10px 1fr auto auto;
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
  .bands {
    display: flex;
    gap: 3px;
    align-self: center;
  }
  .band {
    font-family: var(--font-display);
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.04em;
    padding: 2px 5px;
    border: 1px solid var(--c-line-bright);
    color: var(--c-text);
  }
  .band-6g {
    color: var(--c-primary);
    border-color: color-mix(in oklab, var(--c-primary) 60%, transparent);
  }
  .band-5g {
    color: var(--c-secondary);
    border-color: color-mix(in oklab, var(--c-secondary) 60%, transparent);
  }
  .totals {
    font-size: 10px;
    white-space: nowrap;
  }
  .bar-track {
    height: 3px;
    background: var(--c-line);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: var(--c-primary);
    box-shadow: 0 0 calc(6px * var(--glow-mult)) var(--c-primary);
    transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
</style>
