/** DEMO (removable) — a small fixed toggle (bottom-right) to turn demo charts + sample data on/off from any
 *  surface, no URL editing. Persists via localStorage. Delete src/desk/demo/ + the mount in App.tsx to remove. */
import { isDemo, setDemo } from "./flag";
import "@/styles/demo.css";
import "./investor/investor.css";

export function DemoToggle() {
  const on = isDemo();
  return (
    <>
    {on && <a className="demo-investor-link" href="?window=demo&demo=1">Investor walkthrough ↗</a>}
    <button
      type="button"
      className="demo-toggle"
      aria-pressed={on}
      title="Toggle demo charts + simulated sample data"
      onClick={() => setDemo(!on)}
    >
      ◉ Demo {on ? "on" : "off"}
    </button>
    </>
  );
}
