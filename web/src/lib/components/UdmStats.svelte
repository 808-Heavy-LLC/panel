<script lang="ts">
  import { panel } from '$lib/store.svelte';
  import StatTile from './StatTile.svelte';
  import { formatBytes } from '$lib/format';

  const cpu = $derived(panel.udm?.cpuPct ?? 0);
  const mem = $derived(panel.udm?.memPct ?? 0);
  const temp = $derived(panel.udm?.tempC ?? null);
  const onlineCount = $derived(panel.clients.length);
  const wiredCount = $derived(panel.clients.filter((c) => c.isWired).length);
  const totalDown = $derived(formatBytes(panel.wans.reduce((a, w) => a + w.rxTotal, 0)));
  const totalUp = $derived(formatBytes(panel.wans.reduce((a, w) => a + w.txTotal, 0)));
</script>

<div class="grid grid-cols-2 gap-3">
  <StatTile
    label="CPU"
    value={cpu.toFixed(0)}
    unit="%"
    accent={cpu > 80 ? 'warn' : 'primary'}
    progress={cpu}
  />
  <StatTile
    label="MEMORY"
    value={mem.toFixed(0)}
    unit="%"
    accent={mem > 80 ? 'warn' : 'primary'}
    progress={mem}
  />
  <StatTile
    label="CLIENTS"
    value={onlineCount.toString()}
    unit="online"
    accent="ok"
    sub="{wiredCount} wired"
  />
  <StatTile
    label="TEMP"
    value={temp !== null ? temp.toFixed(0) : '—'}
    unit="°C"
    accent={temp !== null && temp > 70 ? 'warn' : 'primary'}
  />
  <StatTile
    label="TOTAL DOWN"
    value={totalDown.value}
    unit={totalDown.unit}
    accent="primary"
  />
  <StatTile
    label="TOTAL UP"
    value={totalUp.value}
    unit={totalUp.unit}
    accent="secondary"
  />
</div>
