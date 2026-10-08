import {
  ColorType, CrosshairMode, LineStyle,
  type CandlestickStyleOptions, type ChartOptions, type DeepPartial, type SeriesOptionsCommon, type Time, type TickMarkType,
} from "lightweight-charts";
import { formatCrosshairTime, formatTick, type TickKind } from "@/lib/format";
import { PAIR_META, type Pair } from "@/types/market";

export interface ChartTokens {
  bg: string;
  panel: string;
  grid: string;
  text: string;
  muted: string;
  up: string;
  down: string;
  fontMono: string;
}

const FALLBACK: ChartTokens = {
  bg: "#0c1420", panel: "#111b29", grid: "#1a2738", text: "#d3dce8", muted: "#8a9aaf", up: "#2fb88a", down: "#e0575f",
  fontMono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
};

/** Read the CSS variables from `tokens.css`; never hard-code colours in components. */
export function readTokens(el: Element = document.documentElement): ChartTokens {
  const cs = getComputedStyle(el);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    bg: v("--bg", FALLBACK.bg), panel: v("--panel", FALLBACK.panel), grid: v("--grid", FALLBACK.grid),
    text: v("--text", FALLBACK.text), muted: v("--muted", FALLBACK.muted),
    up: v("--up", FALLBACK.up), down: v("--down", FALLBACK.down), fontMono: v("--font-mono", FALLBACK.fontMono),
  };
}

export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function chartOptions(t: ChartTokens): DeepPartial<ChartOptions> {
  const cross = { color: withAlpha(t.text, 0.45), style: LineStyle.Dashed, width: 1 as const, labelBackgroundColor: t.panel };
  return {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: t.bg }, textColor: t.muted, fontSize: 11, fontFamily: t.fontMono },
    grid: { vertLines: { visible: false }, horzLines: { color: t.grid } },
    rightPriceScale: { borderColor: t.grid },
    timeScale: { borderColor: t.grid, timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 8, minBarSpacing: 1 },
    crosshair: { mode: CrosshairMode.Normal, vertLine: cross, horzLine: cross },
  };
}

/** Up candles hollow, down candles filled (never colour alone). */
export function candleOptions(t: ChartTokens, pair: Pair): DeepPartial<CandlestickStyleOptions & SeriesOptionsCommon> {
  const { decimals } = PAIR_META[pair];
  return {
    upColor: "rgba(0, 0, 0, 0)", downColor: t.down,
    borderVisible: true, borderUpColor: t.up, borderDownColor: t.down,
    wickUpColor: t.up, wickDownColor: t.down,
    priceFormat: { type: "price", precision: decimals, minMove: 10 ** -decimals },
    priceLineVisible: false,
  };
}

const TICK_KINDS: Record<number, TickKind> = { 0: "year", 1: "month", 2: "day", 3: "time", 4: "time" };

/** Axis and crosshair time labels in `tz` (an IANA zone). */
export function timeAxisOptions(tz: string): DeepPartial<ChartOptions> {
  const sec = (t: Time): number | null => (typeof t === "number" ? t : null);
  return {
    localization: { timeFormatter: (t: Time) => { const s = sec(t); return s === null ? "" : formatCrosshairTime(s, tz); } },
    timeScale: {
      tickMarkFormatter: (t: Time, type: TickMarkType) => {
        const s = sec(t);
        return s === null ? null : formatTick(s, TICK_KINDS[type] ?? "time", tz);
      },
    },
  };
}