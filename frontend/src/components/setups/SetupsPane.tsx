/** DX3: the two-level setups structure shared by the docked right rail and the popped-out setups window. */
import { useScanStore } from "@/scan/scanStore";
import { SetupDetail } from "./SetupDetail";
import { SetupList } from "./SetupList";

export function SetupsPane() {
  const selected = useScanStore((s) => s.active !== null);
  return (
    <div className="rail-split" data-selected={selected}>
      <div className="rail-level1">
        <SetupList />
      </div>
      <div className="rail-level2">
        <SetupDetail />
      </div>
    </div>
  );
}