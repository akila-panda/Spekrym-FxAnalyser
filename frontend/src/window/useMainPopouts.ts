/** W4: `P` pops out the focused chart; closing main while popouts are open asks first. Main window only. */
import { useEffect } from "react";
import { usePanelStore } from "@/panels/panelStore";
import { useDockStore } from "./dockStore";
import { openPopout } from "./popout";

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function useMainPopouts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key !== "p" && e.key !== "P") return;
      e.preventDefault();
      openPopout({ kind: "chart", tf: usePanelStore.getState().focused });
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (useDockStore.getState().popped.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
}