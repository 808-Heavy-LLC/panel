<script lang="ts">
  import ELK from 'elkjs/lib/elk.bundled.js';
  import { panel } from '$lib/store.svelte';
  import { buildTopology, type Topology, type TopoEdge } from '$lib/topology';
  import { formatBps } from '$lib/format';

  const NODE_W = 168;
  const NODE_H = 60;
  // Edge thickness scales linearly with utilization; idle links still
  // get a faint hairline so the structure is visible.
  const EDGE_MIN_PX = 1.2;
  const EDGE_MAX_PX = 8;

  const elk = new ELK();

  type LaidNode = { x: number; y: number };
  type LaidEdge = { points: Array<{ x: number; y: number }>; labelXY?: { x: number; y: number } };
  type Layout = {
    width: number;
    height: number;
    nodes: Map<string, LaidNode>;
    edges: Map<string, LaidEdge>;
  };

  // Bandwidth is recomputed every tick and drives label/thickness.
  const topology = $derived<Topology>(buildTopology(panel.devices, panel.wans));
  let layout = $state<Layout | null>(null);

  // Signature over the *structural* parts of the topology so we don't
  // rerun layout on every bandwidth update.
  const structureSig = $derived(
    topology.nodes
      .map((n) => n.id)
      .sort()
      .join(',') +
      '|' +
      topology.edges
        .map((e) => `${e.id}:${e.capacityBps}`)
        .sort()
        .join(','),
  );
  let lastSig = '';

  $effect(() => {
    const sig = structureSig;
    if (sig === lastSig) return;
    lastSig = sig;
    void runLayout(topology);
  });

  async function runLayout(t: Topology): Promise<void> {
    if (t.nodes.length === 0) {
      layout = null;
      return;
    }
    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.spacing.nodeNode': '32',
        'elk.layered.spacing.nodeNodeBetweenLayers': '72',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.layered.crossingMinimization.semiInteractive': 'true',
      },
      children: t.nodes.map((n) => ({
        id: n.id,
        width: NODE_W,
        height: NODE_H,
      })),
      edges: t.edges.map((e) => ({
        id: e.id,
        sources: [e.sourceId],
        targets: [e.targetId],
      })),
    } as const;
    const result = await elk.layout(graph as Parameters<typeof elk.layout>[0]);
    const nodeMap = new Map<string, LaidNode>();
    for (const n of result.children ?? []) {
      nodeMap.set(n.id!, { x: n.x ?? 0, y: n.y ?? 0 });
    }
    const edgeMap = new Map<string, LaidEdge>();
    for (const e of result.edges ?? []) {
      const sec = e.sections?.[0];
      if (!sec) continue;
      const points = [
        { x: sec.startPoint.x, y: sec.startPoint.y },
        ...(sec.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
        { x: sec.endPoint.x, y: sec.endPoint.y },
      ];
      // Label sits at the midpoint of the longest segment.
      let bestLen = -1;
      let labelXY = { x: points[0]!.x, y: points[0]!.y };
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > bestLen) {
          bestLen = len;
          labelXY = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
      }
      edgeMap.set(e.id!, { points, labelXY });
    }
    layout = {
      width: result.width ?? 0,
      height: result.height ?? 0,
      nodes: nodeMap,
      edges: edgeMap,
    };
  }

  function pathFromPoints(pts: Array<{ x: number; y: number }>): string {
    if (pts.length === 0) return '';
    let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i]!.x} ${pts[i]!.y}`;
    return d;
  }

  function edgeThickness(e: TopoEdge): number {
    return EDGE_MIN_PX + (EDGE_MAX_PX - EDGE_MIN_PX) * e.utilization;
  }

  function edgeRateLabel(e: TopoEdge): string {
    if (e.rateBps <= 0) return 'idle';
    const f = formatBps(e.rateBps / 8);
    return `${f.value} ${f.unit}`;
  }

  function deviceTypeLabel(t: string): string {
    return t === 'udm' ? 'GATEWAY' : t === 'usw' ? 'SWITCH' : t === 'uap' ? 'AP' : t.toUpperCase();
  }
</script>

<div class="topo-wrap h-full w-full">
  {#if !layout || layout.nodes.size === 0}
    <div class="grid h-full place-items-center text-[11px] uppercase tracking-widest text-[var(--c-text-dim)]">
      Building topology…
    </div>
  {:else}
    <svg
      class="topo-svg"
      viewBox="-20 -20 {layout.width + 40} {layout.height + 40}"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- Edges first so nodes render on top. -->
      {#each topology.edges as edge (edge.id)}
        {@const laid = layout.edges.get(edge.id)}
        {#if laid}
          {@const th = edgeThickness(edge)}
          <g class="edge" class:idle={edge.rateBps <= 0}>
            <path
              d={pathFromPoints(laid.points)}
              fill="none"
              stroke="var(--c-line-bright)"
              stroke-width={th + 4}
              stroke-opacity="0.18"
            />
            <path
              d={pathFromPoints(laid.points)}
              fill="none"
              stroke="var(--c-primary)"
              stroke-width={th}
              stroke-linecap="round"
              stroke-linejoin="round"
              class="edge-stroke"
            />
            {#if laid.labelXY}
              <g transform="translate({laid.labelXY.x},{laid.labelXY.y})">
                <rect
                  x="-32"
                  y="-9"
                  width="64"
                  height="18"
                  rx="2"
                  fill="var(--c-bg)"
                  fill-opacity="0.85"
                  stroke="var(--c-line)"
                  stroke-width="1"
                />
                <text
                  text-anchor="middle"
                  dominant-baseline="middle"
                  class="edge-label"
                >
                  {edgeRateLabel(edge)}
                </text>
              </g>
            {/if}
          </g>
        {/if}
      {/each}

      <!-- Nodes -->
      {#each topology.nodes as node (node.id)}
        {@const pos = layout.nodes.get(node.id)}
        {#if pos}
          {#if node.kind === 'wan'}
            {@const w = node.wan}
            {@const fmtRx = formatBps(w.rxBps)}
            {@const fmtTx = formatBps(w.txBps)}
            <g class="node wan" class:up={w.status === 'ok'} transform="translate({pos.x},{pos.y})">
              <rect
                width={NODE_W}
                height={NODE_H}
                fill="var(--c-bg-panel)"
                stroke="var(--c-secondary)"
                stroke-width="1"
              />
              <rect x="0" y="0" width="3" height={NODE_H} class="node-rail" />
              <text x="12" y="16" class="node-name">{w.label}</text>
              <text x="12" y="30" class="node-meta">
                WAN · {w.speedBitsPerSec >= 1e9
                  ? `${(w.speedBitsPerSec / 1e9).toFixed(0)}G`
                  : `${(w.speedBitsPerSec / 1e6).toFixed(0)}M`}
              </text>
              <text x={NODE_W - 10} y={30} text-anchor="end" class="wan-rx">
                ↓ {fmtRx.value}<tspan class="node-rate-unit"> {fmtRx.unit}</tspan>
              </text>
              <text x={NODE_W - 10} y={NODE_H - 10} text-anchor="end" class="wan-tx">
                ↑ {fmtTx.value}<tspan class="node-rate-unit"> {fmtTx.unit}</tspan>
              </text>
              <circle
                cx={NODE_W - 12}
                cy="12"
                r="3.5"
                class="state-dot"
                fill={w.status === 'ok' ? 'var(--c-ok)' : 'var(--c-err)'}
              />
            </g>
          {:else}
            {@const d = node.device}
            {@const fmt = formatBps(d.bytesRate)}
            <g
              class="node"
              class:up={d.state === 1}
              class:udm={d.type === 'udm'}
              class:usw={d.type === 'usw'}
              class:uap={d.type === 'uap'}
              transform="translate({pos.x},{pos.y})"
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                fill="var(--c-bg-panel)"
                stroke="var(--c-line-bright)"
                stroke-width="1"
                class="node-bg"
              />
              <rect x="0" y="0" width="3" height={NODE_H} class="node-rail" />
              <text x="12" y="16" class="node-name">{d.name}</text>
              <text x="12" y="30" class="node-meta">
                {deviceTypeLabel(d.type)} · {d.model || '—'}
              </text>
              <text x={NODE_W - 10} y={NODE_H - 10} text-anchor="end" class="node-rate">
                <tspan class="node-rate-val">{fmt.value}</tspan>
                <tspan class="node-rate-unit"> {fmt.unit}</tspan>
              </text>
              <circle
                cx={NODE_W - 12}
                cy="12"
                r="3.5"
                class="state-dot"
                fill={d.state === 1 ? 'var(--c-ok)' : 'var(--c-err)'}
              />
            </g>
          {/if}
        {/if}
      {/each}
    </svg>
  {/if}
</div>

<style>
  .topo-wrap {
    overflow: hidden;
  }
  .topo-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .edge-stroke {
    filter: drop-shadow(0 0 calc(2px * var(--glow-mult)) color-mix(in oklab, var(--c-primary) 65%, transparent));
    transition: stroke-width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .edge.idle .edge-stroke {
    stroke: var(--c-line-bright);
    filter: none;
    opacity: 0.5;
  }
  .edge-label {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.04em;
    fill: var(--c-text);
  }
  .edge.idle .edge-label {
    fill: var(--c-text-dim);
  }
  .node-rail {
    fill: var(--c-line);
  }
  .node.up.wan .node-rail {
    fill: var(--c-secondary);
  }
  .node.up.udm .node-rail {
    fill: var(--c-secondary);
  }
  .node.up.usw .node-rail {
    fill: var(--c-primary);
  }
  .node.up.uap .node-rail {
    fill: var(--c-ok);
  }
  .wan-rx {
    font-family: var(--font-mono);
    font-size: 10px;
    fill: var(--c-primary);
  }
  .wan-tx {
    font-family: var(--font-mono);
    font-size: 10px;
    fill: var(--c-secondary);
  }
  .node-name {
    font-family: var(--font-display);
    font-size: 11px;
    letter-spacing: 0.04em;
    fill: var(--c-text-bright);
  }
  .node-meta {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.08em;
    fill: var(--c-text-dim);
    text-transform: uppercase;
  }
  .node-rate-val {
    font-family: var(--font-display);
    font-size: 13px;
    fill: var(--c-primary);
  }
  .node-rate-unit {
    font-family: var(--font-mono);
    font-size: 9px;
    fill: var(--c-text-dim);
  }
  .state-dot {
    filter: drop-shadow(0 0 calc(4px * var(--glow-mult)) currentColor);
  }
</style>
