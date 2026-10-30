/** W6: to-scale monitor map. Drag a role chip onto a screen, or select a chip and click a screen. Hidden when the API is unsupported. */
import { useState, type DragEvent } from "react";
import { useModeStore } from "@/components/layout/modeStore";
import { Icon } from "@/components/ui/Icon";
import { openPopout } from "./popout";
import type { WindowRole } from "./role";
import { mapLayout, placementBounds, supportsWindowManagement } from "./screens";
import { useScreenStore } from "./screenStore";
import { planTwoScreen } from "./twoScreen";

const BOX_W = 240;
const BOX_H = 120;

const ROLES: ReadonlyArray<{ key: string; label: string; role: WindowRole }> = [
  { key: "charts", label: "charts", role: { kind: "charts" } },
  { key: "setups", label: "setups", role: { kind: "setups" } },
  { key: "stack", label: "stack", role: { kind: "stack" } },
];

export function MonitorMap() {
  const [supported] = useState(() => supportsWindowManagement());
  const phase = useScreenStore((s) => s.phase);
  const screens = useScreenStore((s) => s.screens);
  const detect = useScreenStore((s) => s.detect);
  const [chip, setChip] = useState("charts");
  const [fill, setFill] = useState(true);

  if (!supported) return null;

  const place = (roleKey: string, screenId: string) => {
    const r = ROLES.find((x) => x.key === roleKey);
    const s = screens.find((x) => x.id === screenId);
    if (!r || !s) return;
    openPopout(r.role, undefined, { bounds: placementBounds(s, fill) });
  };

  if (phase !== "ok") {
    return (
      <div className="monitor-map" aria-label="Monitor map">
        <button type="button" className="menu-item" disabled={phase === "detecting"} onClick={() => void detect()}>
          {phase === "detecting" ? "Detecting screens…" : (<><Icon name="screens" /> Detect screens</>)}
        </button>
        {phase === "denied" && (
          <p className="mm-note" role="status">
            Screen access denied. Use Pop out, drag the window once; its position is remembered.
          </p>
        )}
        {phase === "error" && (
          <p className="mm-note" role="alert">
            Could not read screens. Use Pop out instead.
          </p>
        )}
      </div>
    );
  }

  const boxes = mapLayout(screens, BOX_W, BOX_H);
  const twoScreen = planTwoScreen(screens);
  const review = () => {
    if (!twoScreen) return;
    useModeStore.getState().setMode("investigate");
    openPopout({ kind: "stack" }, undefined, { bounds: twoScreen.stackBounds, fullscreen: true });
  };
  return (
    <div className="monitor-map" aria-label="Monitor map">
      <div className="mm-chips" role="group" aria-label="Window to place">
        {ROLES.map((r) => (
          <button
            key={r.key}
            type="button"
            draggable
            className="mm-chip"
            aria-pressed={chip === r.key}
            onClick={() => setChip(r.key)}
            onDragStart={(e: DragEvent) => {
              setChip(r.key);
              e.dataTransfer.setData("text/plain", r.key);
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="mm-box" style={{ width: BOX_W, height: BOX_H }}>
        {screens.map((s) => {
          const b = boxes.find((x) => x.id === s.id);
          if (!b) return null;
          return (
            <button
              key={s.id}
              type="button"
              className="mm-screen"
              data-primary={s.isPrimary}
              style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
              aria-label={`Place ${chip} on ${s.label}${s.isPrimary ? " (primary)" : ""}`}
              title={`${s.label} · ${s.frame.width}×${s.frame.height}`}
              onClick={() => place(chip, s.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                place(e.dataTransfer.getData("text/plain") || chip, s.id);
              }}
            >
              {s.isPrimary && (
                <>
                  <Icon name="star" size={10} />{" "}
                </>
              )}
              {s.label}
            </button>
          );
        })}
      </div>
      <label className="mm-fill">
        <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> Fill screen
      </label>
      {twoScreen ? (
        <button type="button" className="menu-item" onClick={review} title={`Stack on ${twoScreen.stack.label}, workbench on ${twoScreen.workbench.label}`}>
          <Icon name="screens" /> Two-screen review
        </button>
      ) : (
        <p className="mm-note" role="status">Two-screen review needs a second screen.</p>
      )}
    </div>
  );
}