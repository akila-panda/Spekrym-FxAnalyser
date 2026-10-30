/** DX4: pure model for the numbered evidence chips drawn at each step's `known_at`. */
import { snapToBar } from "./sharedCrosshair";

export interface StepLike {
  n: number;
  label: string;
  known_at: number;
}

export interface EvidenceChip {
  n: number;
  label: string;
  /** Open time of the bar that contains `known_at`. */
  time: number;
  knownAt: number;
}

/**
 * One chip per step, on the bar that contains its `known_at`, in causal order.
 * Never reads past `asOf`; a step that falls outside the loaded bars, or whose
 * nearest bar opens after `known_at`, is skipped. `upTo` limits to steps n <= upTo (Steps replay).
 */
export function buildChips(
  steps: readonly StepLike[],
  bars: readonly { time: number }[],
  sec: number,
  asOf: number | null,
  upTo: number | null = null,
): EvidenceChip[] {
  const out: EvidenceChip[] = [];
  const ordered = [...steps].sort((a, b) => a.known_at - b.known_at || a.n - b.n);
  for (const s of ordered) {
    if (upTo !== null && s.n > upTo) continue;
    if (asOf !== null && s.known_at > asOf) continue;
    const i = snapToBar(bars, s.known_at, sec);
    const bar = i === null ? undefined : bars[i];
    if (!bar || bar.time > s.known_at) continue;
    out.push({ n: s.n, label: s.label, time: bar.time, knownAt: s.known_at });
  }
  return out;
}

/** Stack chips vertically when they sit closer than `minGap` px. `xs` is in draw order; returns a lane per chip. */
export function assignLanes(xs: readonly number[], minGap: number, maxLanes = 4): number[] {
  const last: number[] = [];
  return xs.map((x) => {
    let lane = 0;
    while (lane < maxLanes - 1 && last[lane] !== undefined && x - last[lane]! < minGap) lane++;
    last[lane] = x;
    return lane;
  });
}