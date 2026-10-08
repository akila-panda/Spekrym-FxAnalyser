import type { SeriesMarker, Time } from "lightweight-charts";
import { formatPrice } from "@/lib/pips";
import type { Annotation } from "@/types/annotations";
import type { Pair } from "@/types/market";
import type { BandFillOpts } from "./primitives/BandFillPrimitive";
import type { LevelOpts } from "./primitives/LevelPrimitive";
import type { LineOpts } from "./primitives/LinePrimitive";
import type { TextItem } from "./primitives/TextPrimitive";
import type { TradeOpts } from "./primitives/TradePrimitive";
import type { WindowOpts } from "./primitives/WindowPrimitive";
import type { ZoneOpts } from "./primitives/ZonePrimitive";
import { roleVar } from "./roles";
import { styleFor, type ColorResolver } from "./styleFor";
import { toMarker } from "./toMarkers";

export type ShapeSpec =
  | { id: string; type: "level"; opts: LevelOpts }
  | { id: string; type: "zone"; opts: ZoneOpts }
  | { id: string; type: "window"; opts: WindowOpts }
  | { id: string; type: "line"; opts: LineOpts }
  | { id: string; type: "trade"; opts: TradeOpts }
  | { id: string; type: "bandfill"; opts: BandFillOpts };

/** A native indicator series the chart renders on the price pane or a sub-pane. `value: null` is a warm-up gap. */
export interface IndicatorSpec {
  id: string;
  paneId: string;
  type: "line" | "histogram" | "area" | "step" | "dots";
  color: string;
  title?: string;
  data: { time: number; value: number | null }[];
}

export interface Specs {
  shapes: ShapeSpec[];
  texts: TextItem[];
  markers: SeriesMarker<Time>[];
  indicators: IndicatorSpec[];
}

/** Legend text for an indicator: its label, else a compact `key=value` of its params. */
function indicatorTitle(label: string | undefined, params: Record<string, unknown> | undefined): string | undefined {
  if (label) return label;
  if (!params) return undefined;
  const parts = Object.entries(params).map(([k, v]) => `${k}=${v}`);
  return parts.length ? parts.join(" ") : undefined;
}

export interface SpecContext {
  resolve: ColorResolver;
  pair: Pair;
  /** Token colours for labels: text, background (halo and axis-label text), mono font stack. */
  text: string;
  bg: string;
  font: string;
}

/** Named dash styles → lightweight-charts dash pattern. `solid` clears the dash. */
const DASH_PATTERN: Record<"solid" | "dashed" | "dotted", readonly number[] | undefined> = {
  solid: undefined,
  dashed: [4, 3],
  dotted: [1, 2],
};

/** Annotation options only (plain data), so the manager can diff them. */
export function toSpecs(annotations: readonly Annotation[], ctx: SpecContext): Specs {
  const out: Specs = { shapes: [], texts: [], markers: [], indicators: [] };
  const labelStyle = { color: ctx.text, halo: ctx.bg, font: ctx.font };

  for (const a of annotations) {
    const st = styleFor(a.role, a.tone);
    const color = ctx.resolve(st.cssVar);
    const emphasis = a.emphasis;

    switch (a.kind) {
      case "level": {
        const extended = a.extend === "right" || a.extend === "both";
        const end = extended ? ("right" as const) : (a.t1 ?? "right");
        // A mitigated level is spent: draw it faint. An explicit dash overrides the role default.
        const levelEmphasis = a.state === "mitigated" ? ("faint" as const) : emphasis;
        out.shapes.push({
          id: a.id, type: "level",
          opts: {
            price: a.price, start: a.t0, end, color, lineWidth: st.lineWidth,
            dash: a.dash ? DASH_PATTERN[a.dash] : st.dash, emphasis: levelEmphasis,
            priceText: a.t1 === undefined && !extended ? formatPrice(a.price, ctx.pair) : undefined, axisTextColor: ctx.bg,
          },
        });
        if (a.label) out.texts.push({ time: a.t0, price: a.price, text: a.label, anchor: "above" });
        break;
      }
      case "zone":
        out.shapes.push({
          id: a.id, type: "zone",
          opts: {
            start: a.t0, end: a.t1, top: a.p_high, bottom: a.p_low, color, fillAlpha: st.fillAlpha,
            borderAlpha: st.borderAlpha, borderDash: st.borderDash, midline: st.midline, emphasis,
          },
        });
        if (a.label) out.texts.push({ time: a.t0, price: a.p_high, text: a.label, anchor: "above" });
        break;
      case "window":
        out.shapes.push({ id: a.id, type: "window", opts: { start: a.t0, end: a.t1, color, fillAlpha: st.fillAlpha, emphasis } });
        break;
      case "line": {
        const dash = a.dash ? DASH_PATTERN[a.dash] : st.dash;
        out.shapes.push({
          id: a.id, type: "line",
          opts: { points: a.points.map((p) => ({ time: p.t, price: p.p })), color, lineWidth: st.lineWidth, dash, emphasis },
        });
        break;
      }
      case "polyline": {
        // A forming pattern is drawn faint + dashed so it never reads as a finished signal.
        const forming = a.complete === false;
        out.shapes.push({
          id: a.id, type: "line",
          opts: {
            points: a.points.map((p) => ({ time: p.t, price: p.p })), color, lineWidth: st.lineWidth,
            dash: forming ? [2, 2] : st.dash, emphasis: forming ? "faint" : emphasis,
          },
        });
        for (const p of a.points) if (p.label) out.texts.push({ time: p.t, price: p.p, text: p.label, anchor: "right" });
        if (a.pattern_name) {
          const head = a.points[0]!;
          out.texts.push({ time: head.t, price: head.p, text: forming ? `${a.pattern_name} (forming)` : a.pattern_name, anchor: "below" });
        }
        break;
      }
      case "fib_zone": {
        // Draw a level line at each ratio between the two anchors; optionally shade the highlight band.
        const pa = a.anchor_a.p;
        const delta = a.anchor_b.p - pa;
        const priceAt = (frac: number) => pa + delta * frac;
        for (const lvl of a.levels) {
          const price = priceAt(lvl);
          out.shapes.push({
            id: `${a.id}:f${lvl}`, type: "level",
            opts: { price, start: a.anchor_a.t, end: a.anchor_b.t, color, lineWidth: 1, dash: st.dash, emphasis: "faint" },
          });
          out.texts.push({ time: a.anchor_b.t, price, text: String(lvl), anchor: "right" });
        }
        if (a.highlight_range) {
          const [loF, hiF] = a.highlight_range;
          out.shapes.push({
            id: `${a.id}:hl`, type: "zone",
            opts: {
              start: a.anchor_a.t, end: a.anchor_b.t, top: priceAt(hiF), bottom: priceAt(loF), color,
              fillAlpha: st.fillAlpha || 0.12, borderAlpha: st.borderAlpha, emphasis,
            },
          });
        }
        if (a.label) out.texts.push({ time: a.anchor_a.t, price: a.anchor_a.p, text: a.label, anchor: "above" });
        break;
      }
      case "trade": {
        const win = a.exit_price === undefined ? undefined : a.direction === "long" ? a.exit_price > a.entry : a.exit_price < a.entry;
        out.shapes.push({
          id: a.id, type: "trade",
          opts: {
            start: a.t0, end: a.t1, entry: a.entry, stop: a.stop, target: a.target,
            entryColor: ctx.resolve(roleVar("entry", a.tone)),
            stopColor: ctx.resolve(roleVar("stop", a.tone)),
            targetColor: ctx.resolve(roleVar("target", a.tone)),
            outcome: win === undefined ? "open" : win ? "win" : "loss",
            label: a.label, labelStyle, emphasis,
          },
        });
        break;
      }
      case "marker":
        out.markers.push(toMarker(a, color));
        break;
      case "text":
        out.texts.push({ time: a.t0, price: a.price, text: a.label, anchor: "above" });
        break;
      case "banded_zone": {
        // Decompose into one zone per band (coloured by the band's role) plus an optional equilibrium level.
        a.bands.forEach((b, i) => {
          const bs = styleFor(b.role, a.tone);
          out.shapes.push({
            id: `${a.id}:b${i}`, type: "zone",
            opts: {
              start: a.t0, end: a.t1, top: b.p_high, bottom: b.p_low, color: ctx.resolve(bs.cssVar),
              fillAlpha: bs.fillAlpha || 0.08, borderAlpha: bs.borderAlpha, borderDash: bs.borderDash, emphasis,
            },
          });
        });
        if (a.mid_price !== undefined) {
          out.shapes.push({
            id: `${a.id}:mid`, type: "level",
            opts: { price: a.mid_price, start: a.t0, end: a.t1, color, lineWidth: 1, dash: [4, 3], emphasis: "faint" },
          });
        }
        if (a.label) out.texts.push({ time: a.t0, price: a.bands[0]!.p_high, text: a.label, anchor: "above" });
        break;
      }
      case "bar_highlight":
        // One marker per flagged bar; price-less, so anchored above the bar.
        for (const t of a.bars) {
          out.markers.push({ time: t as unknown as Time, position: "aboveBar", shape: "square", color, size: emphasis === "strong" ? 1.5 : 1, text: a.label ?? undefined });
        }
        break;
      case "series":
        out.indicators.push({
          id: a.id, paneId: a.pane, type: a.style, color,
          title: indicatorTitle(a.label ?? undefined, a.params_used ?? undefined),
          data: a.points.map((p) => ({ time: p.t, value: p.v })),
        });
        break;
      case "band": {
        // Three lines (upper/mid/lower) on one pane; shared colour, suffixed ids for diffing.
        const title = indicatorTitle(a.label ?? undefined, a.params_used ?? undefined);
        const legs: [string, { t: number; v: number | null }[]][] = [
          ["u", a.upper], ["m", a.mid], ["l", a.lower],
        ];
        for (const [suffix, pts] of legs) {
          out.indicators.push({
            id: `${a.id}:${suffix}`, paneId: a.pane, type: "line", color,
            title: suffix === "m" ? title : undefined,
            data: pts.map((p) => ({ time: p.t, value: p.v })),
          });
        }
        // Fill between the edges on the price pane (sub-pane fills need a pane-local primitive; deferred).
        if (a.fill && a.pane === "price") {
          const edge = (pts: { t: number; v: number | null }[]) =>
            pts.flatMap((p) => (p.v === null ? [] : [{ time: p.t, price: p.v }]));
          out.shapes.push({
            id: `${a.id}:fill`, type: "bandfill",
            opts: { upper: edge(a.upper), lower: edge(a.lower), color, fillAlpha: st.fillAlpha || 0.08, emphasis },
          });
        }
        break;
      }
    }
  }
  out.markers.sort((x, y) => Number(x.time) - Number(y.time));
  return out;
}