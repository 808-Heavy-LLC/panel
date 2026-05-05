<script lang="ts">
  import { theme } from '$lib/theme.svelte';
  let active = $derived(theme.current === 'cyberpunk');
</script>

<div class="grid-stage" class:active>
  <div class="horizon-glow"></div>
  <div class="grid-floor"></div>
</div>

<style>
  .grid-stage {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0;
    transition: opacity 600ms ease;
    overflow: hidden;
  }
  .grid-stage.active {
    opacity: 1;
  }

  .horizon-glow {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--c-primary), var(--c-secondary), transparent);
    box-shadow:
      0 0 16px var(--c-primary),
      0 0 28px var(--c-secondary);
    transform: translateY(-1px);
    opacity: 0.6;
  }

  .grid-floor {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 200vw;
    height: 50vh;
    transform: translateX(-50%) perspective(500px) rotateX(72deg);
    transform-origin: top center;
    background-image:
      linear-gradient(to right, color-mix(in oklab, var(--c-secondary) 50%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in oklab, var(--c-primary) 60%, transparent) 1px, transparent 1px);
    background-size: 100px 100px;
    animation: grid-pull 12s linear infinite;
    will-change: background-position;
    opacity: 0.55;
    mask-image: linear-gradient(to bottom, color-mix(in oklab, black 100%, transparent) 0%, transparent 92%);
    -webkit-mask-image: linear-gradient(to bottom, color-mix(in oklab, black 100%, transparent) 0%, transparent 92%);
  }

  @keyframes grid-pull {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 0 100px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .grid-floor {
      animation: none;
    }
  }
</style>
