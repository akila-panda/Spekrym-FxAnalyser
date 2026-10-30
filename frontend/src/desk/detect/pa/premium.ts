/** DESK DK11 — premium/discount from the current confirmed range: latest confirmed swing high and swing low (swing scale)
 *  known by time `t`; equilibrium = 50%. Pure and causal. Feeds the S/D `location` factor. */
import type { KernelResult } from "@/desk/kernel/kernel";
import type { Swing } from "@/desk/kernel/swings";

export interface ConfirmedRange { hi: Swing; lo: Swing; eq: number }

export function confirmedRange(k: Pick<KernelResult, "swingsSwing">, t: number): ConfirmedRange | null {
  let hi: Swing | null = null;
  let lo: Swing | null = null;
  for (const s of k.swingsSwing) {
    if (s.known_at > t) continue;
    if (s.kind === "high") hi = s; else lo = s;
  }
  if (!hi || !lo || hi.price <= lo.price) return null;
  return { hi, lo, eq: (hi.price + lo.price) / 2 };
}

/** Where a price sits in the range: 0 = range low, 1 = range high. */
export const rangeFraction = (r: ConfirmedRange, price: number): number => (price - r.lo.price) / (r.hi.price - r.lo.price);