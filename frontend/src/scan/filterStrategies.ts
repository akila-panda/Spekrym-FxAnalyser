import type { StrategyDef } from "@/types";

export type SignalClass = "price_only" | "hybrid" | "indicator";
export type ClassFilter = "all" | SignalClass;

export const CLASS_LABEL: Record<SignalClass, string> = {
  price_only: "Price only",
  hybrid: "Hybrid",
  indicator: "Indicator",
};

/** A strategy without a declared class is treated as price_only (backwards compatible). */
export const signalClassOf = (s: Pick<StrategyDef, "signal_class">): SignalClass => s.signal_class ?? "price_only";

/** Filters the catalog by signal class. `all` returns everything. */
export function filterByClass(list: readonly StrategyDef[], cls: ClassFilter): StrategyDef[] {
  return cls === "all" ? [...list] : list.filter((s) => signalClassOf(s) === cls);
}
