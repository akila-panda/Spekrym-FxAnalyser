/** S3: range-sync loop guard. Programmatic range writes are tagged so their echo events are ignored. */
export interface RangeLike { from: number; to: number }

const TOL = 0.51; // logical bars; lwc may round
const ECHO_WINDOW_MS = 150;

export interface RangeGuard {
  /** Runs `fn` as a programmatic (origin = us) range write. */
  apply(fn: () => void, range?: RangeLike): void;
  /** True while applying, or when `r` matches the last applied range within the echo window. */
  isEcho(r: RangeLike): boolean;
}

export function createRangeGuard(now: () => number = Date.now): RangeGuard {
  let applying = false;
  let last: { r: RangeLike; at: number } | null = null;
  return {
    apply(fn, range) {
      applying = true;
      if (range) last = { r: range, at: now() };
      try {
        fn();
      } finally {
        applying = false;
      }
    },
    isEcho(r) {
      if (applying) return true;
      if (!last || now() - last.at > ECHO_WINDOW_MS) return false;
      return Math.abs(r.from - last.r.from) <= TOL && Math.abs(r.to - last.r.to) <= TOL;
    },
  };
}