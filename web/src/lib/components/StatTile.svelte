<script lang="ts">
  type Accent = 'primary' | 'secondary' | 'ok' | 'warn' | 'err';
  type Props = {
    label: string;
    value: string;
    unit?: string;
    accent?: Accent;
    progress?: number | null;
    sub?: string;
  };
  let { label, value, unit = '', accent = 'primary', progress = null, sub = '' }: Props = $props();
</script>

<div class="stat-tile">
  <span class="hud-corner tl" style="border-color: var(--c-{accent})"></span>
  <span class="hud-corner br" style="border-color: var(--c-{accent})"></span>
  <div class="text-[9px] tracking-[0.3em] uppercase text-[var(--c-text-dim)]">{label}</div>
  <div class="mt-1 flex items-baseline gap-1">
    <span
      class="font-display text-[28px] font-semibold leading-none"
      style="color: var(--c-{accent}); text-shadow: 0 0 calc(12px * var(--glow-mult)) color-mix(in oklab, var(--c-{accent}) 60%, transparent);"
    >
      {value}
    </span>
    {#if unit}
      <span class="text-[10px] tracking-widest uppercase text-[var(--c-text-dim)]">{unit}</span>
    {/if}
  </div>
  {#if sub}
    <div class="mt-1 text-[10px] tracking-widest uppercase text-[var(--c-text)]">{sub}</div>
  {/if}
  {#if progress !== null}
    <div class="mt-2 h-[3px] w-full bg-[var(--c-line)]">
      <div
        class="h-full transition-[width] duration-700 ease-out"
        style="width: {Math.max(0, Math.min(100, progress))}%; background: var(--c-{accent}); box-shadow: 0 0 calc(8px * var(--glow-mult)) var(--c-{accent});"
      ></div>
    </div>
  {/if}
</div>

<style>
  .stat-tile {
    position: relative;
    padding: 12px 14px;
    background: linear-gradient(180deg, rgba(13, 22, 34, 0.6), rgba(10, 16, 24, 0.6));
    border: 1px solid var(--c-line);
    clip-path: polygon(
      0 8px, 8px 0,
      100% 0, 100% calc(100% - 8px),
      calc(100% - 8px) 100%, 0 100%
    );
    overflow: hidden;
  }
  :global([data-theme='mission-control']) .stat-tile,
  :global([data-theme='matrix']) .stat-tile {
    clip-path: none;
  }
  .hud-corner {
    width: 10px;
    height: 10px;
  }
  .hud-corner.tl { top: 2px; left: 2px; }
  .hud-corner.br { bottom: 2px; right: 2px; }
</style>
