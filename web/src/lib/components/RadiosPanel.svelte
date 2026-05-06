<script lang="ts">
  import { panel } from '$lib/store.svelte';

  type RadioRow = {
    apName: string;
    band: '2g' | '5g' | '6g';
    channel: number;
    bwMhz: number;
    numClients: number;
    utilizationPct: number;
    satisfaction: number;
    txRetries: number;
    txPackets: number;
  };

  // Flatten every AP's radios into one list, sorted by client count desc.
  const radios = $derived.by<RadioRow[]>(() => {
    const rows: RadioRow[] = [];
    for (const d of panel.devices) {
      if (d.type !== 'uap') continue;
      for (const r of d.radios) {
        rows.push({
          apName: d.name.replace(/\.808\.org$|-ap$/g, '').replace(/-ap\.808\.org$/, ''),
          band: r.band,
          channel: r.channel,
          bwMhz: r.bwMhz,
          numClients: r.numClients,
          utilizationPct: r.utilizationPct,
          satisfaction: r.satisfaction,
          txRetries: r.txRetries,
          txPackets: r.txPackets,
        });
      }
    }
    return rows.sort((a, b) => b.numClients - a.numClients || b.utilizationPct - a.utilizationPct);
  });

  function bandLabel(b: '2g' | '5g' | '6g'): string {
    return b === '2g' ? '2.4G' : b === '5g' ? '5G' : '6G';
  }
  function retryPct(r: RadioRow): number {
    if (r.txPackets <= 0) return 0;
    return Math.min(100, (r.txRetries / r.txPackets) * 100);
  }
</script>

<ul class="grid h-full grid-cols-2 gap-x-4 gap-y-1 overflow-hidden text-[12px] xl:grid-cols-3">
  {#each radios as r (r.apName + r.band + r.channel)}
    {@const util = Math.max(0, Math.min(100, r.utilizationPct))}
    {@const rp = retryPct(r)}
    <li class="radio-row">
      <div class="row-head">
        <span class="band band-{r.band}">{bandLabel(r.band)}</span>
        <span class="ap truncate">{r.apName}</span>
        <span class="ch text-[var(--c-text-dim)]">ch {r.channel}{r.bwMhz ? `·${r.bwMhz}` : ''}</span>
        <span class="clients">{r.numClients}<span class="ml-0.5 text-[10px] text-[var(--c-text-dim)]">cl</span></span>
      </div>
      <div class="metrics">
        <div class="metric">
          <span class="label">UTIL</span>
          <div class="bar"><div class="fill util" style="width: {util}%"></div></div>
          <span class="val">{util.toFixed(0)}%</span>
        </div>
        <div class="metric">
          <span class="label">RETRY</span>
          <div class="bar"><div class="fill retry" style="width: {Math.min(100, rp * 4)}%"></div></div>
          <span class="val">{rp.toFixed(1)}%</span>
        </div>
      </div>
    </li>
  {/each}
  {#if radios.length === 0}
    <li class="col-span-full grid h-full place-items-center text-[var(--c-text-dim)] uppercase tracking-widest text-[11px]">
      No radio data…
    </li>
  {/if}
</ul>

<style>
  .radio-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px 6px;
    border-left: 2px solid var(--c-line);
  }
  .row-head {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 8px;
    align-items: baseline;
    font-size: 12px;
  }
  .band {
    font-family: var(--font-display);
    font-size: 10px;
    line-height: 1;
    letter-spacing: 0.06em;
    padding: 2px 5px;
    border: 1px solid var(--c-line-bright);
    color: var(--c-text);
    align-self: center;
  }
  .band-6g {
    color: var(--c-primary);
    border-color: color-mix(in oklab, var(--c-primary) 60%, transparent);
  }
  .band-5g {
    color: var(--c-secondary);
    border-color: color-mix(in oklab, var(--c-secondary) 60%, transparent);
  }
  .ap {
    color: var(--c-text-bright);
  }
  .ch,
  .clients {
    font-size: 10px;
    white-space: nowrap;
  }
  .clients {
    font-family: var(--font-display);
    color: var(--c-text-bright);
  }
  .metrics {
    display: flex;
    gap: 12px;
  }
  .metric {
    display: grid;
    grid-template-columns: 36px 1fr 32px;
    align-items: center;
    gap: 4px;
    flex: 1;
  }
  .label {
    font-size: 9px;
    letter-spacing: 0.08em;
    color: var(--c-text-dim);
  }
  .bar {
    height: 3px;
    background: var(--c-line);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .fill.util {
    background: var(--c-primary);
    box-shadow: 0 0 calc(4px * var(--glow-mult)) var(--c-primary);
  }
  .fill.retry {
    background: var(--c-warn);
    box-shadow: 0 0 calc(4px * var(--glow-mult)) var(--c-warn);
  }
  .val {
    font-size: 10px;
    text-align: right;
    color: var(--c-text);
  }
</style>
