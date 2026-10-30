/** DESK DK1 — Desk keyboard map (active only while the Desk shell is mounted, i.e. app=desk).
 *  F Focus · S Simplify · Esc restore from Focus · H MY DESK · A Analysis · P/L/V Prepare/Live/Review.
 *  E Evidence drawer (selected object) · Esc closes it first. Never fires while typing. */
import { useEffect } from "react";
import { useDeskStore } from "./deskStore";
import { useDeskUiStore } from "./deskUiStore";

const NON_TEXT = new Set(["range", "checkbox", "radio", "button"]);
export const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT" ||
    (t instanceof HTMLInputElement && !NON_TEXT.has(t.type)));

export function useDeskKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const desk = useDeskStore.getState();
      const ui = useDeskUiStore.getState();
      const k = e.key.toLowerCase();
      if (e.key === "Escape") {
        if (ui.evidenceOpen) { ui.setEvidence(false); e.preventDefault(); }
        else if (ui.focusOn) { ui.setFocus(false); e.preventDefault(); }
        return;
      }
      const run: Record<string, () => void> = {
        f: () => ui.toggleFocus(),
        e: () => ui.toggleEvidence(),
        s: () => ui.simplify(),
        h: () => desk.setArea("my"),
        a: () => desk.setArea("analysis"),
        p: () => desk.setWorkflow("prepare"),
        l: () => desk.setWorkflow("live"),
        v: () => desk.setWorkflow("review"),
      };
      if (run[k]) { run[k]!(); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}