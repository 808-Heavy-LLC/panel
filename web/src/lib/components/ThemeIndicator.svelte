<script lang="ts">
  import { onMount } from 'svelte';
  import { theme, THEME_LABELS } from '$lib/theme.svelte';

  let visible = $state(true);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function show(durationMs = 4000) {
    visible = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      visible = false;
    }, durationMs);
  }

  onMount(() => {
    show(5000);
    const onKey = () => show();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (hideTimer) clearTimeout(hideTimer);
    };
  });

  // Re-trigger show whenever the theme changes.
  $effect(() => {
    void theme.current;
    show();
  });
</script>

<div class="theme-indicator" class:visible>
  <span class="key-hint">⌨</span>
  <span class="label">THEME · </span>
  <span class="name">{THEME_LABELS[theme.current]}</span>
  <span class="hint">[T] CYCLE</span>
</div>

<style>
  .theme-indicator {
    position: fixed;
    bottom: 8px;
    right: 12px;
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: color-mix(in oklab, var(--c-bg) 80%, transparent);
    border: 1px solid var(--c-line);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--c-text-dim);
    opacity: 0;
    transition: opacity 400ms ease;
    pointer-events: none;
  }
  .theme-indicator.visible {
    opacity: 1;
  }
  .key-hint {
    color: var(--c-primary);
    font-size: 11px;
  }
  .label {
    color: var(--c-text-dim);
  }
  .name {
    color: var(--c-primary);
    text-shadow: 0 0 calc(6px * var(--glow-mult)) color-mix(in oklab, var(--c-primary) 40%, transparent);
  }
  .hint {
    color: var(--c-text-dim);
    margin-left: 4px;
    opacity: 0.7;
  }
</style>
