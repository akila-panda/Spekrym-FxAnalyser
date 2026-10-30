/** S5: pure snapping for the shared time crosshair. */
export interface TimedBar {
  time: number;
}

/**
 * Index of the bar a crosshair at `t` should sit on in a chart with `sec`-second bars.
 * Inside a bar's span -> that bar (so an M5 time lands on its containing H1, not the nearest open).
 * In a gap -> the closer neighbour. Outside the loaded data -> null (clear the crosshair).
 */
export function snapToBar(bars: readonly TimedBar[], t: number, sec: number): number | null {
  const n = bars.length;
  if (n === 0 || !Number.isFinite(t)) return null;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.time <= t) lo = mid + 1;
    else hi = mid;
  }
  const prev = lo - 1;
  if (prev < 0) return null;
  if (t < bars[prev]!.time + sec) return prev;
  const next = prev + 1;
  if (next >= n) return null;
  const dPrev = t - (bars[prev]!.time + sec);
  const dNext = bars[next]!.time - t;
  return dPrev <= dNext ? prev : next;
}