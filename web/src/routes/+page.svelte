<script lang="ts">
  import { onMount } from 'svelte';
  import { connectWs, panel } from '$lib/store.svelte';
  import { theme } from '$lib/theme.svelte';
  import { startBurnInGuard } from '$lib/burnInGuard';
  import HudHeader from '$lib/components/HudHeader.svelte';
  import HudFrame from '$lib/components/HudFrame.svelte';
  import BandwidthChart from '$lib/components/BandwidthChart.svelte';
  import ClientsPanel from '$lib/components/ClientsPanel.svelte';
  import DpiPanel from '$lib/components/DpiPanel.svelte';
  import UdmStats from '$lib/components/UdmStats.svelte';
  import ThemeIndicator from '$lib/components/ThemeIndicator.svelte';
  import '../app.css';

  onMount(() => {
    const dispose = theme.init();
    const stop = connectWs();
    const stopGuard = startBurnInGuard();
    return () => {
      dispose();
      stop();
      stopGuard();
    };
  });
</script>

<div class="panel-root flex h-screen w-screen flex-col">
  <HudHeader />

  <main class="grid min-h-0 flex-1 gap-4 p-4" style="grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 1.1fr 1fr;">
    <div style="grid-column: 1 / 3" class="min-h-0 min-w-0">
      <HudFrame label="WAN THROUGHPUT" accent="primary">
        {#snippet actions()}
          <span>WINDOW · 90s</span>
        {/snippet}
        {#snippet children()}
          <div class="flex h-full flex-col gap-3">
            {#each panel.wans as wan (wan.id)}
              <div class="min-h-0 flex-1">
                <BandwidthChart wanId={wan.id} />
              </div>
              {#if wan.id !== panel.wans[panel.wans.length - 1]?.id}
                <div class="border-t border-[var(--c-line)]"></div>
              {/if}
            {/each}
            {#if panel.wans.length === 0}
              <div class="grid h-full place-items-center text-[11px] uppercase tracking-widest text-[var(--c-text-dim)]">
                Awaiting WAN data…
              </div>
            {/if}
          </div>
        {/snippet}
      </HudFrame>
    </div>

    <HudFrame label="GATEWAY · UDM PRO MAX" accent="secondary">
      {#snippet children()}
        <UdmStats />
      {/snippet}
    </HudFrame>

    <HudFrame label="TOP CONSUMERS" accent="primary">
      {#snippet actions()}
        <span>BY THROUGHPUT</span>
      {/snippet}
      {#snippet children()}
        <ClientsPanel />
      {/snippet}
    </HudFrame>

    <HudFrame label="TOP APPLICATIONS" accent="primary">
      {#snippet children()}
        <DpiPanel source="apps" />
      {/snippet}
    </HudFrame>

    <HudFrame label="TOP CATEGORIES" accent="primary">
      {#snippet children()}
        <DpiPanel source="categories" />
      {/snippet}
    </HudFrame>
  </main>
</div>

<div class="hud-scanlines"></div>
<div class="hud-noise"></div>

<ThemeIndicator />
