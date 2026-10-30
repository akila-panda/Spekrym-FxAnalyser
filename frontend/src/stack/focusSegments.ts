/** DX5: pure maths for the Focus strip: setup phases, list position, anchor clamping. */
import type { Setup } from "@/types";
import type { SetupRow } from "@/scan/selectors";

export type SegKey = "context" | "setup" | "target";

export interface Seg {
  key: SegKey;
  label: string;
  /** UTC seconds. */
  from: number;
  to: number;
}

/** Context always shows at least this much lead-in before the setup. */
export const CONTEXT_LEAD_SEC = 3600;
const MIN_WEIGHT = 0.18;

/** Latest recorded trade exit after the setup window, or null when the payload has none. */
export function exitTime(setup: Pick<Setup, "annotations" | "focus">): number | null {
  let out: number | null = null;
  for (const a of setup.annotations) {
    if (a.kind !== "trade" || a.exit_time == null) continue;
    if (a.exit_time > setup.focus.to && (out === null || a.exit_time > out)) out = a.exit_time;
  }
  return out;
}

/**
 * Context = lead-in before `focus.from` (back to the earliest known step, at least 1h).
 * Setup = [focus.from, focus.to). Target = [focus.to, exit); omitted when the exit time is absent.
 */
export function focusSegments(setup: Pick<Setup, "annotations" | "focus" | "steps">): Seg[] {
  const { from, to } = setup.focus;
  const earlier = setup.steps.map((s) => s.known_at).filter((t) => t < from);
  const lead = Math.max(CONTEXT_LEAD_SEC, from - (earlier.length ? Math.min(...earlier) : from));
  const segs: Seg[] = [
    { key: "context", label: "Context", from: from - lead, to: from },
    { key: "setup", label: "Setup", from, to },
  ];
  const exit = exitTime(setup);
  if (exit !== null) segs.push({ key: "target", label: "Target", from: to, to: exit });
  return segs;
}

/** Relative widths summing to 1; no segment narrower than 18% so labels stay readable. */
export function segmentWeights(segs: readonly Seg[]): number[] {
  if (segs.length === 0) return [];
  const total = segs.reduce((n, s) => n + Math.max(0, s.to - s.from), 0);
  const raw = segs.map((s) => (total > 0 ? Math.max(0, s.to - s.from) / total : 1 / segs.length));
  const floored = raw.map((w) => Math.max(MIN_WEIGHT, w));
  const sum = floored.reduce((a, b) => a + b, 0);
  return floored.map((w) => w / sum);
}

/** The segment containing `t`; the last segment owns its end. Null when outside. */
export function segmentAt(segs: readonly Seg[], t: number | null): SegKey | null {
  if (t === null || segs.length === 0) return null;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const last = i === segs.length - 1;
    if (t >= s.from && (t < s.to || (last && t === s.to))) return s.key;
  }
  return null;
}

/** Anchor for a click on `seg`, or null when it starts after `asOf` (the strip never reads past asOf). */
export function segmentAnchor(seg: Seg, asOf: number | null): number | null {
  if (asOf !== null && seg.from > asOf) return null;
  return seg.from;
}

/** 1-based position of `key` in the filtered list, or null when it is not in the list. */
export function listPosition(rows: readonly Pick<SetupRow, "key">[], key: string | null): { index: number; total: number } | null {
  if (key === null) return null;
  const i = rows.findIndex((r) => r.key === key);
  return i < 0 ? null : { index: i + 1, total: rows.length };
}