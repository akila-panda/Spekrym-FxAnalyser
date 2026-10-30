import { useMemo } from "react";
import type { ReviewLookup } from "@/scan/selectors";
import { useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import { reviewLookup, useReviewStore } from "./reviewStore";

/** Review marks as a lookup for `rowsFor`, so the list, J/K, the strips and the palette all agree. */
export function useReviewLookup(): ReviewLookup {
  const entries = useReviewStore((s) => s.entries);
  const panels = useScanStore((s) => s.panels);
  const pair = useViewStore((s) => s.pair);
  return useMemo(() => reviewLookup(entries, pair, panels), [entries, panels, pair]);
}

/** Non-hook form for event handlers and one-shot reads. */
export function currentReviewLookup(): ReviewLookup {
  return reviewLookup(useReviewStore.getState().entries, useViewStore.getState().pair, useScanStore.getState().panels);
}