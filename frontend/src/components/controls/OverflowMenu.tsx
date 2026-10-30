import { useEffect, useRef, useState } from "react";
import { useModeStore } from "@/components/layout/modeStore";
import { PresetBar } from "@/components/controls/PresetBar";
import { Icon } from "@/components/ui/Icon";
import { openShortcuts } from "@/components/ui/ShortcutsSheet";
import { useSettingsStore, type Density, type Theme } from "@/components/ui/settingsStore";
import "@/styles/overflow.css";

/** Secondary header actions. Every action also stays reachable by a visible control. */
export function OverflowMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const theme = useSettingsStore((s) => s.theme);
  const density = useSettingsStore((s) => s.density);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setDensity = useSettingsStore((s) => s.setDensity);
  const autoCollapse = useModeStore((s) => s.autoCollapse);
  const setAutoCollapse = useModeStore((s) => s.setAutoCollapse);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="overflow-menu" ref={root}>
      <button
        ref={btn}
        type="button"
        className="icon-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="overflow-pop" role="dialog" aria-label="More actions">
          <section>
            <h3>Presets and sharing</h3>
            <PresetBar />
          </section>
          <section>
            <h3>Display</h3>
            <div className="overflow-row">
              <label>
                Theme
                <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                Density
                <select value={density} onChange={(e) => setDensity(e.target.value as Density)}>
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                </select>
              </label>
            </div>
            <label className="overflow-check">
              <input type="checkbox" checked={autoCollapse} onChange={(e) => setAutoCollapse(e.target.checked)} /> Auto-hide rails over the stage (Investigate)
            </label>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openShortcuts();
              }}
            >
              Keyboard shortcuts
            </button>
          </section>
        </div>
      )}
    </div>
  );
}