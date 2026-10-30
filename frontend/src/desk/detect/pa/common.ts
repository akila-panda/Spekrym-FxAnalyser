/** DESK DK11 — shared bits for the price-action builders. */
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { Candle } from "@/types/market";
import type { DetectCtx } from "../registry";

export const r2 = (n: number): number => Math.round(n * 100) / 100;
export const cfgOf = (ctx: DetectCtx): typeof DEFAULTS => ctx.cfg ?? DEFAULTS;
export const prov = (ctx: DetectCtx) => ({ rulesVersion: ctx.rulesVersion, dataKind: ctx.dataKind, detector: "priceAction", detectorVersion: 1 });
export const dirOf = (c: Candle): "bull" | "bear" | null => (c.close > c.open ? "bull" : c.close < c.open ? "bear" : null);