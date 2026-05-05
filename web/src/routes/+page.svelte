<script lang="ts">
  import { onMount } from 'svelte';
  import { connectWs } from '$lib/store.svelte';
  import { theme } from '$lib/theme.svelte';
  import HudHeader from '$lib/components/HudHeader.svelte';
  import HudFrame from '$lib/components/HudFrame.svelte';
  import BandwidthChart from '$lib/components/BandwidthChart.svelte';
  import ClientsPanel from '$lib/components/ClientsPanel.svelte';
  import DpiPanel from '$lib/components/DpiPanel.svelte';
  import UdmStats from '$lib/components/UdmStats.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import PerspectiveGrid from '$lib/components/PerspectiveGrid.svelte';
  import ThemeIndicator from '$lib/components/ThemeIndicator.svelte';
  import '../app.css';

  onMount(() => {
    const dispose = theme.init();
    const stop = connectWs();
    return () => {
      dispose();
      stop();
    };
  });
</script>

<PerspectiveGrid />
<MatrixRain />

<div class="panel-root flex h-screen w-screen flex-col">
  <HudHeader />

  <main class="grid min-h-0 flex-1 gap-4 p-4" style="grid-template-columns: 2fr 1fr; grid-template-rows: 1.1fr 1fr;">
    <HudFrame label="WAN THROUGHPUT" accent="primary" sweep>
      {#snippet actions()}
        <span>WINDOW · 90s</span>
      {/snippet}
      {#snippet children()}
        <BandwidthChart />
      {/snippet}
    </HudFrame>

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

    <HudFrame label="TRAFFIC CATEGORIES" accent="primary">
      {#snippet children()}
        <DpiPanel />
      {/snippet}
    </HudFrame>
  </main>
</div>

<ThemeIndicator />
