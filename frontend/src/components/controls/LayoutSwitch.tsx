import { usePanelStore } from "@/panels/panelStore";
import type { Layout } from "@/panels/layouts";

const OPTIONS: readonly { id: Layout; label: string }[] = [
  { id: "grid", label: "Grid" },
  { id: "focus", label: "Focus" },
  { id: "stack", label: "Stack" },
  { id: "maximized", label: "Maximized" },
];

export function LayoutSwitch() {
  const layout = usePanelStore((s) => s.layout);
  const setLayout = usePanelStore((s) => s.setLayout);
  return (
    <div className="field layout-switch segmented" role="group" aria-label="Layout">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" aria-pressed={layout === o.id} onClick={() => setLayout(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}