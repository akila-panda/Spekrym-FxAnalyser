import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import type { AnnotationOf } from "@/types/annotations";

const SHAPE = { arrow_up: "arrowUp", arrow_down: "arrowDown", circle: "circle" } as const;

/** Marker annotation to a series marker, positioned at its price. `color` is already resolved. */
export function toMarker(a: AnnotationOf<"marker">, color: string): SeriesMarker<Time> {
  return {
    time: a.t0 as UTCTimestamp,
    position: "atPriceMiddle",
    price: a.price,
    shape: SHAPE[a.shape],
    color,
    size: a.emphasis === "strong" ? 1.5 : 1,
    text: a.label ?? undefined,
  };
}