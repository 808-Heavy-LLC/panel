<script lang="ts">
  import { theme } from '$lib/theme.svelte';
  let active = $derived(theme.current === 'cyberpunk');
</script>

<div class="grid-stage" class:active>
  <div class="horizon-glow"></div>
  <div class="grid-floor"></div>
  <div class="grid-ceiling"></div>
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
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--c-primary), var(--c-secondary), transparent);
    box-shadow:
      0 0 24px var(--c-primary),
      0 0 48px var(--c-secondary);
    transform: translateY(-1px);
    opacity: 0.7;
  }

  .grid-floor,
  .grid-ceiling {
    position: absolute;
    left: 50%;
    width: 300vw;
    height: 60vh;
    transform-origin: top center;
    background-image:
      linear-gradient(to right, color-mix(in oklab, var(--c-secondary) 60%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in oklab, var(--c-primary) 70%, transparent) 1px, transparent 1px);
    background-size: 80px 80px;
    will-change: background-position;
  }

  .grid-floor {
    top: 50%;
    transform: translateX(-50%) perspective(420px) rotateX(70deg);
    animation: grid-pull 4s linear infinite;
    opacity: 0.85;
    mask-image: linear-gradient(to bottom, color-mix(in oklab, black 100%, transparent) 0%, transparent 90%);
    -webkit-mask-image: linear-gradient(to bottom, color-mix(in oklab, black 100%, transparent) 0%, transparent 90%);
  }

  .grid-ceiling {
    bottom: 50%;
    transform: translateX(-50%) perspective(420px) rotateX(-70deg);
    transform-origin: bottom center;
    animation: grid-push 4s linear infinite;
    opacity: 0.6;
    mask-image: linear-gradient(to top, color-mix(in oklab, black 100%, transparent) 0%, transparent 90%);
    -webkit-mask-image: linear-gradient(to top, color-mix(in oklab, black 100%, transparent) 0%, transparent 90%);
  }

  @keyframes grid-pull {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 0 80px;
    }
  }
  @keyframes grid-push {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 0 -80px;
    }
  }
</style>
