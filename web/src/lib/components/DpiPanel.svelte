<script lang="ts">
  import { panel } from '$lib/store.svelte';
  import { theme } from '$lib/theme.svelte';
  import { formatBytes } from '$lib/format';

  // Read theme palette from CSS vars; re-evaluates whenever theme changes.
  const palette = $derived.by(() => {
    void theme.current;
    if (typeof document === 'undefined') return ['#00d9ff'];
    const root = getComputedStyle(document.documentElement);
    return Array.from({ length: 8 }, (_, i) => root.getPropertyValue(`--dpi-${i + 1}`).trim() || '#00d9ff');
  });

  const top = $derived(panel.dpi.slice(0, 8));
  const totalBytes = $derived(top.reduce((a, b) => a + b.bytes, 0));

  const RADIUS = 60;
  const STROKE = 14;
  const CIRC = 2 * Math.PI * RADIUS;

  const segments = $derived.by(() => {
    let offset = 0;
    return top.map((c, i) => {
      const len = c.pct * CIRC;
      const seg = { offset, len, color: palette[i % palette.length] ?? '#00d9ff', pct: c.pct, name: c.name };
      offset += len;
      return seg;
    });
  });
</script>

{#if !panel.features.dpiAvailable}
  <div class="grid h-full place-items-center px-4 text-center">
    <div class="space-y-2">
      <div class="hud-label text-[12px]" style="color: var(--c-secondary);">DPI UNAVAILABLE</div>
      <div class="text-[11px] text-[var(--c-text-dim)] leading-relaxed">
        Set <span class="text-[var(--c-text)]">UDM_USERNAME</span> +
        <span class="text-[var(--c-text)]">UDM_PASSWORD</span> in <code>.env</code> to enable
        category-level traffic data.
      </div>
    </div>
  </div>
{:else}
  <div class="flex h-full gap-4">
    <div class="flex flex-col items-center justify-center">
      <svg width={(RADIUS + STROKE) * 2} height={(RADIUS + STROKE) * 2} class="-rotate-90">
        <circle
          cx={RADIUS + STROKE}
          cy={RADIUS + STROKE}
          r={RADIUS}
          fill="none"
          stroke="var(--c-line)"
          stroke-width={STROKE}
        />
        {#each segments as seg, i (seg.name)}
          <circle
            cx={RADIUS + STROKE}
            cy={RADIUS + STROKE}
            r={RADIUS}
            fill="none"
            stroke={seg.color}
            stroke-width={STROKE}
            stroke-dasharray="{seg.len} {CIRC}"
            stroke-dashoffset={-seg.offset}
            style="filter: drop-shadow(0 0 calc(4px * var(--glow-mult)) {seg.color}); transition: stroke-dasharray 0.6s, stroke-dashoffset 0.6s;"
          />
        {/each}
      </svg>
      <div class="mt-2 text-center">
        <div class="font-display text-[18px] hud-value-primary leading-none">
          {formatBytes(totalBytes).value}
        </div>
        <div class="text-[10px] tracking-widest uppercase text-[var(--c-text-dim)]">
          {formatBytes(totalBytes).unit} TOTAL
        </div>
      </div>
    </div>

    <ul class="flex flex-1 flex-col justify-center gap-1.5 text-[11px]">
      {#each top as cat, i}
        {@const color = palette[i % palette.length] ?? '#00d9ff'}
        <li class="dpi-row">
          <span class="dot" style="background: {color}; box-shadow: 0 0 calc(6px * var(--glow-mult)) {color};"></span>
          <span class="name truncate">{cat.name}</span>
          <span class="pct font-display" style="color: {color};">{(cat.pct * 100).toFixed(1)}%</span>
          <div class="track">
            <div
              class="fill"
              style="width: {cat.pct * 100}%; background: {color}; box-shadow: 0 0 calc(6px * var(--glow-mult)) {color};"
            ></div>
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .dpi-row {
    display: grid;
    grid-template-columns: 10px 1fr auto;
    grid-template-rows: auto 4px;
    grid-column-gap: 8px;
    align-items: center;
  }
  .dot {
    grid-row: 1;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .name {
    grid-row: 1;
    color: var(--c-text-bright);
  }
  .pct {
    grid-row: 1;
    font-size: 12px;
  }
  .track {
    grid-row: 2;
    grid-column: 2 / -1;
    height: 3px;
    background: var(--c-line);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
</style>
