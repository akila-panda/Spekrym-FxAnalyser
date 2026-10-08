export type Emphasis = "faint" | "normal" | "strong";

/** Bars a primitive maps times against. Read live, so scroll-back and data swaps need no re-attach. */
export interface BarFeed {
  getBars: () => readonly { time: number }[];
  /** Timeframe length in seconds (used to extrapolate off the loaded bars). */
  barSeconds: number;
}

/** A time that is either a UTC-seconds instant or "right" = extend to the right edge of the pane. */
export type TimeOrRight = number | "right";

/** Resolved CSS colours only; roles are mapped to colours in Phase 6. */
export interface LineStyleOpts {
  color: string;
  /** CSS pixels. */
  lineWidth?: number;
  /** CSS pixels, e.g. [4, 3]. Omit for solid. */
  dash?: readonly number[];
}

export interface CommonOpts {
  emphasis?: Emphasis;
  /** Draw at reduced strength (selection dims everything else to 0.3). */
  alpha?: number;
}

export interface Coordinates {
  /** CSS-pixel x for a UTC-seconds time; extrapolates off the loaded bars. */
  timeX(time: number): number | null;
  priceY(price: number): number | null;
}