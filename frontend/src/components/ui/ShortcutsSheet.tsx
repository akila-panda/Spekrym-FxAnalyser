import { useEffect, useRef, type KeyboardEvent } from "react";
import { create } from "zustand";
import { PANEL_ORDER } from "@/types/market";
import { Icon } from "./Icon";
import "@/styles/chrome.css";

export const SHORTCUTS: readonly { keys: readonly string[]; label: string }[] = [
  { keys: ["J", "K"], label: "Next / previous setup" },
  { keys: ["[", "]"], label: "Previous / next step" },
  { keys: [`1–${PANEL_ORDER.length}`], label: "Focus a chart by position" },
  { keys: ["Y", "N", "R"], label: "Review: looks right / wrong / revisit" },
  { keys: ["M"], label: "Maximize / restore the focused chart" },
  { keys: ["Esc"], label: "Restore, or close a dialog" },
  { keys: ["Ctrl/⌘", "K"], label: "Command palette" },
  { keys: ["?"], label: "Show this sheet" },
  { keys: ["F"], label: "Desk: Focus (hide widgets)" },
  { keys: ["S"], label: "Desk: Simplify" },
  { keys: ["E"], label: "Desk: Evidence drawer" },
  { keys: ["H", "A"], label: "Desk: MY DESK / Analysis" },
  { keys: ["P", "L", "V"], label: "Desk: Prepare / Live / Review" },
  { keys: ["U"], label: "Desk Prepare: undo last triage" },
];

interface SheetState {
  open: boolean;
  setOpen: (v: boolean) => void;
}
export const useShortcutsStore = create<SheetState>()((set) => ({ open: false, setOpen: (open) => set({ open }) }));
export const openShortcuts = (): void => useShortcutsStore.getState().setOpen(true);

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName));

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export function ShortcutsSheet() {
  const open = useShortcutsStore((s) => s.open);
  const setOpen = useShortcutsStore((s) => s.setOpen);
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      setOpen(!useShortcutsStore.getState().open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    return () => prev?.focus?.();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div ref={box} className="sheet" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onKeyDown={onKeyDown}>
        <header>
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button ref={closeBtn} type="button" className="icon-btn" aria-label="Close shortcuts" onClick={() => setOpen(false)}>
            <Icon name="close" />
          </button>
        </header>
        <dl>
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="sheet-row">
              <dt>
                {s.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dt>
              <dd>{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}