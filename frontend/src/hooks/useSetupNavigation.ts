import { useEffect } from "react";
import { rowKey, rowsFor, neighbor, stepNeighbor } from "@/scan/selectors";
import { useScanStore } from "@/scan/scanStore";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import { MARK_KEY, reviewKey, useReviewStore } from "@/review/reviewStore";
import { currentReviewLookup } from "@/review/useReviewLookup";

const NON_TEXT = new Set(["range", "checkbox", "radio", "button"]);
const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT" ||
    (t instanceof HTMLInputElement && !NON_TEXT.has(t.type)));

/** J / K: next and previous setup in the list. [ and ]: previous and next step. Y / N / R: review mark (DX12). Clicks go through `activate` directly. */
export function useSetupNavigation(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "k") {
        const s = useScanStore.getState();
        const rows = rowsFor(s.panels, s.tab, s.filters, currentReviewLookup());
        const cur = s.active ? rowKey(s.active.tf, s.active.id) : null;
        const next = neighbor(rows, cur, k === "j" ? 1 : -1);
        if (next) {
          e.preventDefault();
          s.activate(next.tf, next.setup.id);
        }
      } else if (k in MARK_KEY) {
        const s = useScanStore.getState();
        const result = s.active ? s.panels[s.active.tf].result : undefined;
        if (!s.active || !result || document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        useReviewStore.getState().toggleMark(reviewKey(useViewStore.getState().pair, result, s.active.id), MARK_KEY[k]!);
      } else if (e.key === "[" || e.key === "]") {
        const a = useAnnotationStore.getState();
        if (a.steps.length === 0) return;
        e.preventDefault();
        a.setStep(stepNeighbor(a.steps, a.step, e.key === "]" ? 1 : -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}