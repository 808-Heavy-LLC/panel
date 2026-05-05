<script lang="ts">
  type Accent = 'primary' | 'secondary' | 'ok' | 'warn' | 'err';
  type Props = {
    label?: string;
    accent?: Accent;
    sweep?: boolean;
    children: import('svelte').Snippet;
    actions?: import('svelte').Snippet;
  };
  let { label, accent = 'primary', sweep = false, children, actions }: Props = $props();
</script>

<div class="hud-frame relative flex h-full w-full flex-col p-4" class:hud-sweep={sweep}>
  <span class="hud-corner tl" style="border-color: var(--c-{accent})"></span>
  <span class="hud-corner tr" style="border-color: var(--c-{accent})"></span>
  <span class="hud-corner bl" style="border-color: var(--c-{accent})"></span>
  <span class="hud-corner br" style="border-color: var(--c-{accent})"></span>

  {#if label || actions}
    <header class="mb-3 flex items-center justify-between gap-2">
      {#if label}
        <div class="flex items-center gap-2">
          <span class="hud-label text-[11px]" style="color: var(--c-{accent})">
            ◉ {label}
          </span>
          <span class="hud-tick" style="background: var(--c-{accent})"></span>
        </div>
      {/if}
      {#if actions}
        <div class="text-[10px] uppercase tracking-widest text-[var(--c-text-dim)]">
          {@render actions()}
        </div>
      {/if}
    </header>
  {/if}

  <div class="min-h-0 flex-1">
    {@render children()}
  </div>
</div>

<style>
  .hud-tick {
    display: inline-block;
    width: 24px;
    height: 1px;
    opacity: 0.6;
  }
</style>
