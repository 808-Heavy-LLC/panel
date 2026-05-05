// 9 positions in a small grid (±4px max). Different offsets in each axis
// so static UI elements never sit on the exact same pixel for long.
const DRIFT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [4, 2],
  [-3, 4],
  [3, -3],
  [-4, -2],
  [2, 3],
  [-2, -4],
  [4, 0],
  [-4, 1],
];

export type BurnInGuardOptions = {
  driftMs?: number;
  selector?: string;
};

/** Periodically shift the UI by a few pixels so static bright elements never
 *  burn into a single LCD subpixel. Returns a cleanup function. */
export function startBurnInGuard(opts: BurnInGuardOptions = {}): () => void {
  const driftMs = opts.driftMs ?? 180_000;
  const selector = opts.selector ?? '.panel-root';

  let idx = 1; // start at 1 so first drift moves off (0,0)
  function drift(): void {
    const root = document.querySelector(selector) as HTMLElement | null;
    if (!root) return;
    const [x, y] = DRIFT_OFFSETS[idx % DRIFT_OFFSETS.length] ?? [0, 0];
    root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    idx++;
  }

  const driftTimer = window.setInterval(drift, driftMs);
  return () => window.clearInterval(driftTimer);
}
