/** DESK DK19 — protocol constants (see docs/DK19_PROTOCOL.md; revise the protocol before changing any value). */
import type { Timeframe } from "@/types/market";

export const SCORE_TFS = ["D", "H4", "H1", "M15", "M5"] as const satisfies readonly Timeframe[];
/** H1: bars of the FVG's own TF, after known_at, in which a fill must occur. */
export const FILL_HORIZON_BARS = 100;
/** Groups with fewer observations than this show counts only. */
export const MIN_N = 20;
export const Z95 = 1.96;

export type MetricId = "fvgFill" | "reaction" | "sweepOpposite" | "sweepSame";
export const METRICS: readonly { id: MetricId; label: string; question: string }[] = [
  { id: "fvgFill", label: "H1 · FVG fill", question: "Share of FVGs with a fill fact within 100 bars." },
  { id: "reaction", label: "H2 · Zone-edge reaction", question: "Share of entered FVG / S-D zones that departed the edge ≥ reactAtr×ATR within reactBars (no close beyond the far edge first)." },
  { id: "sweepOpposite", label: "H3 · Sweep → opposite displacement", question: "Share of sweeps followed by a displacement away from the swept side within followBars." },
  { id: "sweepSame", label: "H3b · Sweep → same-side displacement", question: "Share of sweeps followed by a displacement continuing past the swept side within followBars." },
];
export const PROTOCOL_NOTE =
  "Exploratory and descriptive: observed shares in one sample history. Not a forecast and not a tuning signal; the methodology is never changed from here.";