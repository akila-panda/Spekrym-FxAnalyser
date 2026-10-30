/** DX2: the stack's row view: which TFs are supported, shown and hidden for the selected strategy plus the user's override. */
import { useMemo } from "react";
import { selectStrategyDef, useScanStore } from "@/scan/scanStore";
import { useRowsStore } from "./rowsStore";
import { hiddenRows, supportedRows, visibleRows } from "./viewportPolicy";

export function useStackRows() {
  const def = useScanStore(selectStrategyDef);
  const override = useRowsStore((s) => s.visible);
  return useMemo(
    () => ({
      def,
      supported: supportedRows(def),
      visible: visibleRows(def, override),
      hidden: hiddenRows(def, override),
      custom: override !== null,
    }),
    [def, override],
  );
}