/** DX11: command palette (Cmd/Ctrl+K). A real dialog: focus trap, Esc closes, results are a listbox with aria-activedescendant. State is E (memory only). */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { create } from "zustand";
import { actions, readContext } from "@/commands/actions";
import { buildCommands, searchCommands, type Command } from "@/commands/registry";
import "@/styles/palette.css";

interface PaletteState {
  open: boolean;
  setOpen: (v: boolean) => void;
}
export const usePaletteStore = create<PaletteState>()((set) => ({ open: false, setOpen: (open) => set({ open }) }));
export const openPalette = (): void => usePaletteStore.getState().setOpen(true);

const isApple = (): boolean => typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
const LIST_ID = "palette-list";
const optId = (i: number): string => `palette-opt-${i}`;

/** The visible control for the palette (principle 7: the shortcut is never the only path). */
export function PaletteButton() {
  return (
    <button type="button" className="palette-btn" aria-label="Open command palette" aria-haspopup="dialog" title="Command palette" onClick={openPalette}>
      Commands <kbd className="mono">{isApple() ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

export function CommandPalette() {
  const open = usePaletteStore((s) => s.open);
  const setOpen = usePaletteStore((s) => s.setOpen);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      setOpen(!usePaletteStore.getState().open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return open ? <PaletteDialog onClose={() => setOpen(false)} /> : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const ctx = useMemo(() => readContext(), []);
  const commands = useMemo(() => buildCommands(ctx, actions), [ctx]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchCommands(commands, query, ctx, actions), [commands, query, ctx]);
  const current = results.length === 0 ? -1 : Math.min(active, results.length - 1);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => prev?.focus?.();
  }, []);

  useEffect(() => {
    document.getElementById(optId(current))?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = results.length;
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" && n > 0) {
      e.preventDefault();
      setActive((current + 1) % n);
    } else if (e.key === "ArrowUp" && n > 0) {
      e.preventDefault();
      setActive((current - 1 + n) % n);
    } else if (e.key === "Home" && n > 0 && e.ctrlKey) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && n > 0 && e.ctrlKey) {
      e.preventDefault();
      setActive(n - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[current]);
    } else if (e.key === "Tab") {
      e.preventDefault(); // the input is the only tab stop: the trap
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <input
          ref={input}
          className="pal-input"
          type="text"
          role="combobox"
          aria-label="Search commands"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={LIST_ID}
          aria-activedescendant={current >= 0 ? optId(current) : undefined}
          placeholder="Type a command, or a setup number…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        <ul id={LIST_ID} className="pal-list" role="listbox" aria-label="Commands">
          {results.map((c, i) => (
            <li
              key={c.id}
              id={optId(i)}
              role="option"
              aria-selected={i === current}
              className="pal-opt"
              onMouseMove={() => i !== current && setActive(i)}
              onClick={() => run(c)}
            >
              <span className="pal-title">{c.title}</span>
              {c.detail && <span className="pal-detail mono">{c.detail}</span>}
              <span className="pal-group">{c.group}</span>
            </li>
          ))}
        </ul>
        {results.length === 0 && <p className="pal-empty">No matching command.</p>}
        <p className="pal-sr" role="status">{results.length === 0 ? "No results" : `${results.length} results`}</p>
      </div>
    </div>
  );
}