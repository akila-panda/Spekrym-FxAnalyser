/** DESK DK7 — client-side Pine v6 generator for a Prepare snapshot's accepted, still-active objects.
 *  Pure and deterministic (no clock). One as-of path (viewAsOf). Colours are the existing role tokens' hex values.
 *  Drawn once on the last bar. Over-limit items are dropped (lowest significance first) and reported, never silently. */
import { describeObject, fmtTime } from "@/desk/evidence/describe";
import { INBOX_TYPES } from "@/desk/prepare/walk";
import type { AnalysisObject, Snapshot } from "@/desk/types/schemas";
import { PAIR_META, TF_SECONDS, type Pair, type Timeframe } from "@/types/market";
import { activeObjects, oneLine, toPlainList } from "./plainList";
import { addMeter, emptyMeter, fits, PINE_LIMITS, type Meter } from "./pineLimits";

/** Hex copies of tokens.css role colours (a test asserts each exists there — no new colours). */
export const PINE_COLORS = {
  range: "#8aa4ff", context: "#6e809a", liquidity: "#4fd0e0", structure: "#eef3f9",
  fvgBull: "#38c493", fvgBear: "#ea6a72", premium: "#e8a0a0", discount: "#7fd1b9",
} as const;

export const FX_ROLL_NOTE = "FX roll: D=22:00 UTC, W=Sun 22:00 UTC. All times are absolute UTC; TradingView feed/timezone not matched (OQ-4).";

export const pineStr = (s: string, max = 80): string =>
  `"${oneLine(s).slice(0, max).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export interface PineManifest {
  snapshotId: string; pair: string; date: string; asOf: number; rulesVersion: string; dataKind: "sample" | "live";
  generator: "spekrym-desk-dk7"; fxRoll: string;
  exported: number; skipped: { spent: number; unsupported: number; overLimit: number };
}
export interface PineResult { code: string; manifest: PineManifest; meter: Meter; plain: string }

type Kind = "box" | "line" | "trend";
const kindOf = (o: AnalysisObject): Kind | null => {
  if (o.type === "trendline") return (o.geometry.points?.length ?? 0) >= 2 ? "trend" : null;
  const b = o.geometry.bands;
  if (b.length === 0) return null;
  return b.some((x) => x.pHigh > x.pLow) ? "box" : "line";
};

function colorOf(o: AnalysisObject): string {
  switch (o.type) {
    case "fvg": return o.direction === "bear" ? PINE_COLORS.fvgBear : PINE_COLORS.fvgBull;
    case "sd_zone": return o.direction === "bear" ? PINE_COLORS.premium : PINE_COLORS.discount;
    case "liquidity_pool": return PINE_COLORS.liquidity;
    case "trendline": return PINE_COLORS.structure;
    case "reference_level": return PINE_COLORS.context;
    default: return PINE_COLORS.range;
  }
}

const COST: Record<Kind, Partial<Meter>> = { box: { boxes: 1, labels: 1 }, line: { lines: 1, labels: 1 }, trend: { lines: 1, labels: 1 } };
const ms = (sec: number): number => Math.round(sec) * 1000;

function drawLines(o: AnalysisObject, kind: Kind, asOf: number): string[] {
  const dec = PAIR_META[o.pair as Pair].decimals;
  const p = (v: number): string => v.toFixed(dec);
  const c = colorOf(o);
  const tfSec = TF_SECONDS[o.source_tf as Timeframe];
  const text = pineStr(`[${o.source_tf}] ${describeObject(o, "headline", { viewTf: o.source_tf as Timeframe }).headline}`);
  const pts = [...(o.geometry.points ?? [])].sort((a, b) => a.t - b.t);
  const left = kind === "trend" ? pts[0]!.t : Math.min(...o.geometry.anchorTimes, o.t_event);
  const right = Math.max(asOf, left + tfSec);
  const out: string[] = [];
  let mid: number;
  if (kind === "box") {
    const hi = Math.max(...o.geometry.bands.map((b) => b.pHigh));
    const lo = Math.min(...o.geometry.bands.map((b) => b.pLow));
    mid = (hi + lo) / 2;
    const style = o.type === "fvg" ? "line.style_dotted" : "line.style_solid";
    const fill = o.type === "sd_zone" ? 75 : 88;
    out.push(`box.new(left=${ms(left)}, top=${p(hi)}, right=${ms(right)}, bottom=${p(lo)}, xloc=xloc.bar_time, extend=extend.right, border_color=${c}, border_width=1, border_style=${style}, bgcolor=color.new(${c}, ${fill}))`);
  } else if (kind === "line") {
    mid = o.geometry.bands[0]!.pHigh;
    out.push(`line.new(x1=${ms(left)}, y1=${p(mid)}, x2=${ms(right)}, y2=${p(mid)}, xloc=xloc.bar_time, extend=extend.right, color=${c}, style=line.style_solid, width=1)`);
  } else {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    mid = b.p;
    out.push(`line.new(x1=${ms(a.t)}, y1=${p(a.p)}, x2=${ms(Math.max(b.t, a.t + tfSec))}, y2=${p(b.p)}, xloc=xloc.bar_time, extend=extend.right, color=${c}, style=line.style_dashed, width=1)`);
  }
  out.push(`label.new(x=${ms(right)}, y=${p(mid)}, text=${text}, xloc=xloc.bar_time, style=label.style_label_left, color=color.new(${c}, 100), textcolor=${c}, size=size.small)`);
  return out;
}

const priority = (o: AnalysisObject): number => o.grade?.significance ?? -1;

export function buildPine(snap: Snapshot): PineResult {
  const { active, spent } = activeObjects(snap);
  const drawable = active.filter((o) => INBOX_TYPES.has(o.type) && kindOf(o) !== null)
    .sort((a, b) => priority(b) - priority(a) || (a.id < b.id ? -1 : 1));
  const unsupported = active.length - drawable.length;

  let meter = emptyMeter();
  const body: string[] = [];
  let overLimit = 0;
  for (const o of drawable) {
    const kind = kindOf(o)!;
    if (!fits(meter, COST[kind])) { overLimit++; continue; }
    meter = addMeter(meter, COST[kind]);
    body.push(...drawLines(o, kind, snap.as_of));
  }

  const stamp = snap.dataKind === "sample" ? "SAMPLE" : "LIVE";
  const manifest: PineManifest = {
    snapshotId: snap.id, pair: snap.pair, date: snap.date, asOf: snap.as_of, rulesVersion: snap.rulesVersion,
    dataKind: snap.dataKind, generator: "spekrym-desk-dk7", fxRoll: FX_ROLL_NOTE,
    exported: drawable.length - overLimit, skipped: { spent, unsupported, overLimit },
  };
  const title = `Desk ${snap.pair.replace("_", "/")} ${snap.date} [${stamp}]`;
  const head = [
    "//@version=6",
    `// Spekrym-FX Desk export (DK7) — ${stamp}${snap.dataKind === "sample" ? " data, not live market data" : ""}`,
    `// snapshot: ${oneLine(snap.id)}`,
    `// rulesVersion: ${oneLine(snap.rulesVersion)} · as of ${fmtTime(snap.as_of)} · data: ${snap.dataKind}`,
    `// ${FX_ROLL_NOTE}`,
    `// exported ${manifest.exported} · skipped: spent ${spent}, unsupported ${unsupported}, over TradingView limits ${overLimit}`,
    ...(snap.notes ? [`// notes: ${oneLine(snap.notes).slice(0, 300)}`] : []),
    `indicator(${pineStr(title)}, overlay=true, max_lines_count=${PINE_LIMITS.lines}, max_boxes_count=${PINE_LIMITS.boxes}, max_labels_count=${PINE_LIMITS.labels}, max_polylines_count=${PINE_LIMITS.polylines})`,
    "",
    "var table stamp = table.new(position.top_right, 1, 1)",
    "if barstate.islast",
    `    table.cell(stamp, 0, 0, ${pineStr(`${stamp} · ${snap.id}`, 100)}, text_color=${PINE_COLORS.context}, text_size=size.small)`,
  ];
  const code = [...head, ...body.map((l) => `    ${l}`), ""].join("\n");
  return { code, manifest, meter, plain: toPlainList(snap) };
}

export const exportBase = (snap: Snapshot): string => `spekrym-desk_${snap.id}`.replace(/[^\w.-]+/g, "-");