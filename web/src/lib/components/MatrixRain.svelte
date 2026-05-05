<script lang="ts">
  import { onMount } from 'svelte';
  import { theme, cssColor } from '$lib/theme.svelte';

  let canvas: HTMLCanvasElement;
  let raf = 0;
  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let drops: number[] = [];
  let lastFrame = 0;
  const FPS = 16;
  const FRAME_MS = 1000 / FPS;
  const FONT_SIZE = 18;
  const CHARS = 'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789ABCDEF<>{}[]/\\';

  let active = $derived(theme.current === 'matrix');

  function resize() {
    if (!canvas) return;
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const cols = Math.floor(cssW / FONT_SIZE);
    drops = Array.from({ length: cols }, () => Math.random() * -cssH);
  }

  function draw(ts: number) {
    raf = requestAnimationFrame(draw);
    if (ts - lastFrame < FRAME_MS) return;
    lastFrame = ts;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // trail (fade previous frame)
    ctx.fillStyle = 'rgba(0, 3, 0, 0.08)';
    ctx.fillRect(0, 0, cssW, cssH);

    const primary = cssColor('--c-primary', '#00ff41');
    const bright = cssColor('--c-text-bright', '#b3ffb3');

    ctx.font = `${FONT_SIZE}px "Share Tech Mono", monospace`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < drops.length; i++) {
      const x = i * FONT_SIZE;
      const y = drops[i]!;
      const ch = CHARS[Math.floor(Math.random() * CHARS.length)]!;

      // bright leading character
      ctx.fillStyle = bright;
      ctx.fillText(ch, x, y);

      // dimmer character one row up (recently fallen)
      ctx.fillStyle = primary;
      ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)]!, x, y - FONT_SIZE);

      drops[i] = y + FONT_SIZE;
      if (y > cssH && Math.random() > 0.975) drops[i] = -FONT_SIZE;
    }
  }

  onMount(() => {
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  });
</script>

<canvas
  bind:this={canvas}
  class="matrix-rain"
  style:opacity={active ? 0.55 : 0}
></canvas>

<style>
  .matrix-rain {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    transition: opacity 600ms ease;
    mix-blend-mode: screen;
  }
</style>
