/** DX10: header segmented control for the workbench mode. The current mode is always visible. */
import { useModeStore } from "@/components/layout/modeStore";
import { MODE_LABELS, MODES } from "@/components/layout/modes";

export function ModeSwitch() {
  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);
  return (
    <div className="field mode-switch segmented" role="group" aria-label="Workbench mode">
      {MODES.map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}