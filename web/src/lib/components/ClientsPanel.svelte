<script lang="ts">
  import { flip } from 'svelte/animate';
  import { panel } from '$lib/store.svelte';
  import { formatBps, formatBytes } from '$lib/format';

  const TOP_N = 10;

  const sorted = $derived(
    panel.clients
      .slice()
      .sort((a, b) => b.rxBps + b.txBps - (a.rxBps + a.txBps))
      .slice(0, TOP_N),
  );

  const peak = $derived(Math.max(1, ...sorted.map((c) => c.rxBps + c.txBps)));
</script>

<ul class="flex h-full flex-col gap-1.5 overflow-hidden text-[12px]">
  {#each sorted as client (client.id)}
    {@const total = client.rxBps + client.txBps}
    {@const w = (total / peak) * 100}
    {@const rxPct = total > 0 ? (client.rxBps / total) * 100 : 0}
    {@const fmtRx = formatBps(client.rxBps)}
    {@const fmtTx = formatBps(client.txBps)}
    {@const fmtTotal = formatBytes(client.rxBytes + client.txBytes)}
    {@const subtitle = [client.device, client.vendor].filter(Boolean).join(' · ')}
    <li animate:flip={{ duration: 400 }} class="client-row">
      <div class="row-head">
        <span class="conn-glyph" class:wired={client.isWired} title={client.isWired ? 'Wired' : 'Wireless'}>
          {client.isWired ? '◆' : '◇'}
        </span>
        <span class="name-stack min-w-0">
          <span class="name truncate">{client.name}</span>
          {#if subtitle}
            <span class="meta truncate">{subtitle}</span>
          {/if}
        </span>
        <span class="ip text-[var(--c-text-dim)]">{client.ip ?? ''}</span>
        <span class="totals text-[var(--c-text-dim)]">
          ↓ <span class="text-[var(--c-primary)]">{fmtRx.value}</span>
          ↑ <span class="text-[var(--c-secondary)]">{fmtTx.value}</span>
          <span class="ml-2">Σ {fmtTotal.value}{fmtTotal.unit}</span>
        </span>
      </div>
      <div class="bar-track">
        <div
          class="bar-fill bar-rx"
          style="width: {w * (rxPct / 100)}%"
        ></div>
        <div
          class="bar-fill bar-tx"
          style="width: {w * (1 - rxPct / 100)}%"
        ></div>
      </div>
    </li>
  {/each}
  {#if sorted.length === 0}
    <li class="grid h-full place-items-center text-[var(--c-text-dim)] uppercase tracking-widest text-[11px]">
      Awaiting client data…
    </li>
  {/if}
</ul>

<style>
  .client-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 6px;
    border-left: 2px solid var(--c-line);
    transition: border-color 0.3s ease;
  }
  .client-row:hover {
    border-left-color: var(--c-primary);
  }
  .row-head {
    display: grid;
    grid-template-columns: 16px 1fr auto auto;
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
  .ip {
    font-size: 10px;
  }
  .totals {
    font-size: 10px;
    white-space: nowrap;
  }
  .conn-glyph {
    color: var(--c-text-dim);
    font-size: 10px;
  }
  .conn-glyph.wired {
    color: var(--c-primary);
    text-shadow: 0 0 calc(6px * var(--glow-mult)) var(--c-primary);
  }
  .bar-track {
    height: 4px;
    background: var(--c-line);
    display: flex;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .bar-rx {
    background: linear-gradient(90deg, color-mix(in oklab, var(--c-primary) 50%, transparent), var(--c-primary));
    box-shadow: 0 0 calc(8px * var(--glow-mult)) var(--c-primary);
  }
  .bar-tx {
    background: linear-gradient(90deg, var(--c-secondary), color-mix(in oklab, var(--c-secondary) 50%, transparent));
    box-shadow: 0 0 calc(8px * var(--glow-mult)) var(--c-secondary);
  }
</style>
