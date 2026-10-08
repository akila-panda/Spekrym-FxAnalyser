import { PAIR_META, type Pair } from "@/types/market";

export const pipSize = (pair: Pair): number => PAIR_META[pair].pip;
export const priceDecimals = (pair: Pair): number => PAIR_META[pair].decimals;
export const toPips = (priceDiff: number, pair: Pair): number => priceDiff / pipSize(pair);
export const fromPips = (pips: number, pair: Pair): number => pips * pipSize(pair);
export const formatPrice = (price: number, pair: Pair): string => price.toFixed(priceDecimals(pair));
export const formatPips = (pips: number, digits = 1): string =>
  `${pips > 0 ? "+" : ""}${pips.toFixed(digits)}p`;