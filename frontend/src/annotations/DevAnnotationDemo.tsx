import { useEffect, useState } from "react";
import type { ChartApi } from "@/chart/chartApi";
import { readTokens } from "@/chart/theme";
import { formatPrice } from "@/lib/pips";
import { TF_SECONDS, type Candle, type Pair, type Timeframe } from "@/types/market";
import { LevelPrimitive } from "./primitives/LevelPrimitive";
import { LinePrimitive } from "./primitives/LinePrimitive";
import { TextPrimitive } from "./primitives/TextPrimitive";
import { TradePrimitive } from "./primitives/TradePrimitive";
import { WindowPrimitive } from "./primitives/WindowPrimitive";
import { ZonePrimitive } from "./primitives/ZonePrimitive";

interface Props {
  api: ChartApi | null;
  tf: Timeframe;
  pair: Pair;
  candles: readonly Candle[];
}

const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

/** DEV ONLY: draws one sample of each primitive on the last ~40 bars of this panel. */
export function DevAnnotationDemo({ api, tf, pair, candles }: Props) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!on || !api || candles.length < 40) return;
    const n = candles.length;
    const at = (back: number) => candles[n - 1 - back]!;
    const slice = candles.slice(n - 40);
    const hi = Math.max(...slice.map((b) => b.high));
    const lo = Math.min(...slice.map((b) => b.low));
    const span = hi - lo;
    const mid = (hi + lo) / 2;
    const feed = { getBars: () => api.getCandles(), barSeconds: TF_SECONDS[tf] };
    const t = readTokens();
    const label = { color: t.text, halo: t.bg, font: t.fontMono };
    const detach = [
      new WindowPrimitive(feed, { start: at(39).time, end: at(30).time, color: cssVar("--role-window") }),
      new ZonePrimitive(feed, {
        start: at(28).time, end: at(18).time, top: mid + span * 0.1, bottom: mid - span * 0.05,
        color: cssVar("--role-fvg-bull"), fillAlpha: 0.14, borderAlpha: 0.5, borderDash: [1, 2],
      }),
      new ZonePrimitive(feed, {
        start: at(16).time, end: "right", top: hi, bottom: mid,
        color: cssVar("--role-premium"), fillAlpha: 0.05, midline: true,
      }),
      new LevelPrimitive(feed, {
        price: lo + span * 0.2, start: at(35).time, end: "right", color: cssVar("--role-liquidity"), dash: [4, 3],
        priceText: formatPrice(lo + span * 0.2, pair), axisTextColor: t.bg,
      }),
      new LinePrimitive(feed, {
        points: slice.slice(5).map((b) => ({ time: b.time, price: (b.high + b.low) / 2 })),
        color: cssVar("--role-filter"), lineWidth: 1.5,
      }),
      new TradePrimitive(feed, {
        start: at(14).time, end: at(5).time, entry: mid, stop: mid - span * 0.12, target: mid + span * 0.24,
        entryColor: cssVar("--role-entry"), stopColor: cssVar("--role-stop"), targetColor: cssVar("--role-target"),
        outcome: "win", label: "+2.0R", labelStyle: label,
      }),
      new TextPrimitive(feed, {
        style: label,
        items: [
          { time: at(20).time, price: mid + span * 0.1, text: "FVG", anchor: "above" },
          { time: at(20).time, price: mid + span * 0.1, text: "BOS", anchor: "above" },
          { time: at(35).time, price: lo + span * 0.2, text: "SSL", anchor: "below" },
        ],
      }),
    ].map((p) => api.attachPrimitive(p));
    return () => detach.forEach((d) => d());
  }, [on, api, candles, tf, pair]);

  return (
    <button
      type="button"
      className="dev-demo-btn"
      aria-pressed={on}
      disabled={!api}
      onClick={() => setOn((v) => !v)}
      title="Dev only: draw a sample of each annotation kind"
    >
      Demo
    </button>
  );
}