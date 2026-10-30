import type { TimezoneMode } from "@/lib/format";
import { useViewStore } from "@/store/viewStore";
import { PAIRS, type Pair } from "@/types/market";
import { bindStore, type Binding, type BindContext, type StoreLike } from "./bindStore";

/** Replicated view fields. `layout` is window-scoped and is not here. */
export interface ViewFields {
  pair: Pair;
  asOf: number | null;
  timezone: TimezoneMode;
  linked: boolean;
}

const TZ: readonly TimezoneMode[] = ["utc", "local", "strategy"];

export const pickView = (s: ViewFields): ViewFields => ({
  pair: s.pair,
  asOf: s.asOf,
  timezone: s.timezone,
  linked: s.linked,
});

export function validateView(raw: unknown): ViewFields | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.pair !== "string" || !(PAIRS as readonly string[]).includes(r.pair)) return null;
  if (!(r.asOf === null || (typeof r.asOf === "number" && Number.isFinite(r.asOf)))) return null;
  if (typeof r.timezone !== "string" || !TZ.includes(r.timezone as TimezoneMode)) return null;
  if (typeof r.linked !== "boolean") return null;
  return { pair: r.pair as Pair, asOf: r.asOf, timezone: r.timezone as TimezoneMode, linked: r.linked };
}

export function bindView(
  ctx: BindContext,
  store: StoreLike<ViewFields> = useViewStore as unknown as StoreLike<ViewFields>,
): Binding {
  return bindStore<ViewFields, ViewFields>({
    ...ctx,
    slice: "view",
    store,
    pick: pickView,
    validate: validateView,
    toPatch: (p) => p,
  });
}