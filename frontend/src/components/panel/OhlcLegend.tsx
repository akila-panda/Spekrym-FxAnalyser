import type { OhlcBar } from "@/chart/ChartCanvas";
import { formatChange, formatCrosshairTime, tzShort } from "@/lib/format";
import { formatPrice } from "@/lib/pips";
import type { Pair } from "@/types/market";

interface Props {
  bar: OhlcBar | undefined;
  pair: Pair;
  tz: string;
}

/** OHLC readout for the bar under the crosshair (or the latest bar). Lives in the header, never over candles. */
export function OhlcLegend({ bar, pair, tz }: Props) {
  if (!bar) return <span className="legend mono" />;
  const ch = formatChange(bar.open, bar.close, pair);
  return (
    <span className="legend mono">
      <span>{formatCrosshairTime(bar.time, tz)} {tzShort(bar.time, tz)}</span>
      <span>O {formatPrice(bar.open, pair)}</span>
      <span>H {formatPrice(bar.high, pair)}</span>
      <span>L {formatPrice(bar.low, pair)}</span>
      <span>C {formatPrice(bar.close, pair)}</span>
      <span className={ch.pips >= 0 ? "chg-up" : "chg-down"}>{ch.text}</span>
    </span>
  );
}