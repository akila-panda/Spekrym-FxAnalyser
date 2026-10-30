/** DESK DK2 — kernel: closed bars → ATR14 → swings (2 scales) → displacement. Params come from
 *  methodology defaults (ATR units); nothing hard-coded here. */
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { Candle, Pair, Timeframe } from "@/types/market";
import { atr } from "./atr";
import { closedBars } from "./closedBars";
import { findDisplacements, type Displacement } from "./displacement";
import { swingScales, type Swing } from "./swings";

export interface KernelConfig {
  swingN: Record<Timeframe, number>;
  swingScaleMult: number;
  atrPeriod: number;
  dispAtr: number;
  dispMaxBars: number;
}

export interface KernelResult {
  pair: Pair;
  tf: Timeframe;
  asOf: number;
  bars: Candle[];
  atr: (number | null)[];
  swingsInternal: Swing[];
  swingsSwing: Swing[];
  displacements: Displacement[];
}

export function runKernel(
  candles: readonly Candle[],
  ctx: { pair: Pair; tf: Timeframe; asOf: number },
  cfg: KernelConfig = DEFAULTS,
): KernelResult {
  const bars = closedBars(candles, ctx.tf, ctx.asOf);
  const a = atr(bars, cfg.atrPeriod);
  const sc = swingScales(bars, ctx.tf, cfg.swingN[ctx.tf], cfg.swingScaleMult);
  const displacements = findDisplacements(bars, a, ctx, cfg.dispAtr, cfg.dispMaxBars);
  return { ...ctx, bars, atr: a, swingsInternal: sc.internal, swingsSwing: sc.swing, displacements };
}