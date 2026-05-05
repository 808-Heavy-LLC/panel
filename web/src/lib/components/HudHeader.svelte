<script lang="ts">
  import { onMount } from 'svelte';
  import { panel } from '$lib/store.svelte';
  import { formatBps, formatClock, formatDate, formatUptime } from '$lib/format';

  let now = $state(new Date());

  onMount(() => {
    const id = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(id);
  });

  const totalRx = $derived(formatBps(panel.totalRxBps()));
  const totalTx = $derived(formatBps(panel.totalTxBps()));

  const connClass = $derived.by(() => {
    if (panel.connection !== 'open') return 'err';
    return '';
  });
  const connLabel = $derived.by(() => {
    if (panel.connection !== 'open') return panel.connection.toUpperCase();
    if (panel.source === 'mock') return 'MOCK FEED';
    return panel.features.snmpAvailable ? 'LIVE · SNMP' : 'LIVE';
  });
</script>

<header class="flex items-center gap-6 border-b border-[var(--c-line)] px-6 py-3">
  <div class="flex items-center gap-3">
    <svg width="28" height="28" viewBox="0 0 28 28" class="hud-flicker">
      <polygon
        points="14,2 26,8 26,20 14,26 2,20 2,8"
        fill="none"
        stroke="var(--c-primary)"
        stroke-width="1.5"
        style="filter: drop-shadow(0 0 calc(4px * var(--glow-mult)) var(--c-primary));"
      />
      <circle cx="14" cy="14" r="3" fill="var(--c-secondary)" style="filter: drop-shadow(0 0 calc(4px * var(--glow-mult)) var(--c-secondary));" />
    </svg>
    <div class="flex flex-col leading-tight">
      <span class="hud-label text-[14px]">PANEL</span>
      <span class="text-[9px] tracking-[0.3em] text-[var(--c-text-dim)]">NETWORK OPS</span>
    </div>
  </div>

  <div class="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--c-text-dim)]">
    <span class="hud-pulse-dot {connClass}"></span>
    <span>{connLabel}</span>
  </div>

  <div class="flex items-baseline gap-4 text-[10px] uppercase tracking-widest text-[var(--c-text-dim)]">
    <span>
      <span style="color: var(--c-primary);">▼</span>
      <span class="hud-value-primary font-display text-[16px] leading-none">{totalRx.value}</span>
      <span>{totalRx.unit}</span>
    </span>
    <span>
      <span style="color: var(--c-secondary);">▲</span>
      <span class="hud-value-secondary font-display text-[16px] leading-none">{totalTx.value}</span>
      <span>{totalTx.unit}</span>
    </span>
  </div>

  <div class="flex-1"></div>

  {#if panel.udm}
    <div class="flex items-center gap-6 text-[10px] uppercase tracking-widest text-[var(--c-text-dim)]">
      <span>{panel.udm.model}</span>
      <span>FW {panel.udm.firmware}</span>
      <span>UP {formatUptime(panel.udm.uptimeSec)}</span>
    </div>
  {/if}

  <div class="flex flex-col items-end leading-tight">
    <span class="hud-value-primary font-display text-[22px] leading-none tracking-[0.15em]">
      {formatClock(now)}
    </span>
    <span class="text-[9px] tracking-[0.3em] text-[var(--c-text-dim)]">{formatDate(now)}</span>
  </div>
</header>
