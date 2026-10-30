/** W4: header dropdown: open windows (role + live dot) and pop-out / re-dock actions. W6: monitor map. Main window only. */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useDockStore } from "./dockStore";
import { MonitorMap } from "./MonitorMap";
import { openPopout, redock } from "./popout";
import { parseRole, type WindowRole } from "./role";
import { usePeers } from "./usePeers";

const TARGETS: ReadonlyArray<{ key: string; label: string; role: WindowRole }> = [
  { key: "charts", label: "charts", role: { kind: "charts" } },
  { key: "setups", label: "setups", role: { kind: "setups" } },
  { key: "stack", label: "stack", role: { kind: "stack" } },
];

export function WindowsMenu() {
  const [isMain] = useState(() => parseRole(window.location.search).kind === "main");
  const [open, setOpen] = useState(false);
  const popped = useDockStore((s) => s.popped);
  const notice = useDockStore((s) => s.notice);
  const peers = usePeers();
  const root = useRef<HTMLDivElement>(null);

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

  if (!isMain) return null;
  return (
    <div className="windows-menu" ref={root}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label="Windows menu">
        Windows{peers.length > 0 ? ` (${peers.length + 1})` : ""} <Icon name="caret-down" size={12} />
      </button>
      {notice && <span className="popout-notice" role="status">{notice}</span>}
      {open && (
        <div className="menu-pop" role="menu" aria-label="Windows">
          <div className="menu-section" aria-label="Open windows">
            <div className="menu-row"><span className="live-dot" aria-hidden="true"><Icon name="dot" size={10} /></span> This window · main</div>
            {peers.map((p) => (
              <div className="menu-row" key={p.origin}><span className="live-dot" aria-hidden="true"><Icon name="dot" size={10} /></span> {p.role} · synced</div>
            ))}
          </div>
          {TARGETS.map((t) => {
            const isOut = popped.has(t.key);
            return (
              <button
                key={t.key}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  if (isOut) redock(t.key);
                  else openPopout(t.role);
                  setOpen(false);
                }}
              >
                <Icon name={isOut ? "dock" : "popout"} /> {isOut ? `Re-dock ${t.label}` : `Pop out ${t.label}`}
              </button>
            );
          })}
          <MonitorMap />
        </div>
      )}
    </div>
  );
}