import { useViewStore } from "@/store/viewStore";

/** Links the five charts: when on, selecting a setup moves and zooms every chart to it. */
export function LinkToggle() {
  const linked = useViewStore((s) => s.linked);
  const toggleLinked = useViewStore((s) => s.toggleLinked);
  return (
    <div className="field link-toggle" role="group" aria-label="Chart linking">
      <button
        type="button"
        aria-pressed={linked}
        onClick={toggleLinked}
        title={linked ? "Charts follow the selected setup (click to unlink)" : "Charts stay put (click to link)"}
      >
        {linked ? "🔗 Linked" : "⛓️‍💥 Unlinked"}
      </button>
    </div>
  );
}
