/** DX2/5.7: `Rows` menu on the stack bar. A checkbox per TF; at least one row always stays. Window-scoped. */
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useRowsStore } from "./rowsStore";
import { useStackRows } from "./useStackRows";
import { STACK_ORDER } from "./viewportPolicy";

export function RowsMenu() {
  const { def, supported, visible, custom } = useStackRows();
  const toggle = useRowsStore((s) => s.toggle);
  const reset = useRowsStore((s) => s.reset);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="rows-menu" ref={root}>
      <button
        type="button"
        className="resnap"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={id}
        aria-label="Choose visible rows"
        onClick={() => setOpen((v) => !v)}
      >
        Rows ({visible.length}) <Icon name="caret-down" size={12} />
      </button>
      {open && (
        <div id={id} className="menu-pop rows-pop" role="group" aria-label="Visible rows">
          {STACK_ORDER.map((tf) => {
            const on = visible.includes(tf);
            const unsupported = supported !== null && !supported.has(tf);
            return (
              <label key={tf} className="menu-item rows-item">
                <input type="checkbox" checked={on} disabled={on && visible.length === 1} onChange={() => toggle(tf, def)} />
                <span className="mono">{tf}</span>
                {unsupported && <span className="rows-note">not supported</span>}
              </label>
            );
          })}
          <button type="button" className="menu-item" disabled={!custom} onClick={reset}>
            Default rows
          </button>
        </div>
      )}
    </div>
  );
}