import { TF_SECONDS, type Timeframe } from "@/types/market";
import type { Annotation } from "@/types/annotations";

export interface RoutingOverrides {
  /** Annotation ids forced visible on this panel. */
  show?: ReadonlySet<string>;
  /** Annotation ids forced hidden on this panel. Hide wins over show. */
  hide?: ReadonlySet<string>;
}

type Flow = "down" | "local" | "all";

/** Default flow by kind: context flows down, detail stays local, trades appear everywhere. */
export const DEFAULT_FLOW: Record<Annotation["kind"], Flow> = {
  level: "down",
  zone: "down",
  window: "down",
  line: "down",
  polyline: "down",
  banded_zone: "down",
  fib_zone: "down",
  bar_highlight: "local",
  series: "down",
  band: "down",
  marker: "local",
  text: "local",
  trade: "all",
};

/** "Context flows down": should `a` be drawn on the chart of timeframe `panelTf`? */
export function shouldShow(a: Annotation, panelTf: Timeframe, overrides?: RoutingOverrides): boolean {
  if (overrides?.hide?.has(a.id)) return false;
  if (overrides?.show?.has(a.id)) return true;
  if (a.visible_on) return a.visible_on.includes(panelTf);
  const flow = a.flow ?? DEFAULT_FLOW[a.kind];
  if (flow === "all") return true;
  if (flow === "local") return panelTf === a.source_tf;
  return TF_SECONDS[panelTf] <= TF_SECONDS[a.source_tf];
}