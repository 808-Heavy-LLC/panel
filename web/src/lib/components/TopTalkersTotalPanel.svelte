<script lang="ts">
  import { panel } from '$lib/store.svelte';
  import { formatBytes, formatBps } from '$lib/format';

  const top = $derived(
    panel.clients
      .slice()
      .sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes))
      .slice(0, 12),
  );

  const totalBytes = $derived(top.reduce((s, c) => s + c.rxBytes + c.txBytes, 0));
</script>

<ul class="flex h-full flex-col gap-1.5 overflow-hidden text-[12px]">
  {#each top as c (c.id)}
    {@const total = c.rxBytes + c.txBytes}
    {@const fmtTotal = formatBytes(total)}
    {@const rate = formatBps(c.rxBps + c.txBps)}
    {@const pct = totalBytes > 0 ? (total / totalBytes) * 100 : 0}
    <li class="row">
      <span class="state-dot" class:wired={c.isWired}></span>
      <span class="name-stack min-w-0">
        <span class="name truncate">{c.name}</span>
        <span class="meta truncate">
          {c.device ?? c.vendor ?? (c.isWired ? 'wired' : 'wireless')}
        </span>
      </span>
      <span class="bar-track" title={`${pct.toFixed(1)}% of session bytes`}>
        <span class="bar-fill" style="width: {pct.toFixed(1)}%"></span>
      </span>
      <span class="totals">
        <span class="total-val hud-value-primary">{fmtTotal.value}</span>
        <span class="total-unit"> {fmtTotal.unit}</span>
      </span>
      <span class="rate">
        {rate.value}<span class="rate-unit"> {rate.unit}</span>
      </span>
    </li>
  {/each}
  {#if top.length === 0}
    <li class="grid h-full place-items-center text-[11px] uppercase tracking-widest text-[var(--c-text-dim)]">
      No client data yet…
    </li>
  {/if}
</ul>

<style>
  .row {
    display: grid;
    grid-template-columns: 10px 1fr 80px 78px 70px;
    gap: 8px;
    align-items: center;
    padding: 4px 6px;
    border-left: 2px solid var(--c-line);
    font-size: 11px;
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
    letter-spacing: 0.05em;
  }
  .state-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-primary);
    box-shadow: 0 0 calc(4px * var(--glow-mult)) var(--c-primary);
  }
  .state-dot.wired {
    background: var(--c-secondary);
    box-shadow: 0 0 calc(4px * var(--glow-mult)) var(--c-secondary);
  }
  .bar-track {
    height: 4px;
    background: var(--c-line);
    overflow: hidden;
  }
  .bar-fill {
    display: block;
    height: 100%;
    background: var(--c-primary);
    box-shadow: 0 0 calc(6px * var(--glow-mult)) var(--c-primary);
  }
  .totals {
    text-align: right;
    font-family: var(--font-mono);
    font-size: 11px;
    white-space: nowrap;
  }
  .total-val {
    font-family: var(--font-display);
    font-size: 12px;
  }
  .total-unit {
    font-size: 10px;
    color: var(--c-text-dim);
  }
  .rate {
    text-align: right;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--c-text);
    white-space: nowrap;
  }
  .rate-unit {
    color: var(--c-text-dim);
  }
</style>
