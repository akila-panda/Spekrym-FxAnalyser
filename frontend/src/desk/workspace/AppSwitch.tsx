/** DESK DK1 — the top-level Scan | Desk switch. Shown in both headers; keeps pair/timezone (viewStore). */
import { useDeskStore } from "./deskStore";

export function AppSwitch() {
  const app = useDeskStore((s) => s.app);
  const setApp = useDeskStore((s) => s.setApp);
  return (
    <div className="dk-appswitch" role="group" aria-label="App">
      <button type="button" aria-pressed={app === "scan"} onClick={() => setApp("scan")}>Scan</button>
      <button type="button" aria-pressed={app === "desk"} onClick={() => setApp("desk")}>Desk</button>
    </div>
  );
}
