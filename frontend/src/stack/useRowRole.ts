/** DX4: a row's role (Context / Focus / Detail) for the selected setup, and the candle weight that follows from it. */
import { useEffect } from "react";
import type { ChartApi } from "@/chart/chartApi";
import { usePanelStore } from "@/panels/panelStore";
import { useScanStore } from "@/scan/scanStore";
import type { Timeframe } from "@/types/market";
import { ROLE_LABEL, rowRole, type RowRole } from "./rowCaption";

export const CONTEXT_CANDLE_ALPHA = 0.7;

export function useRowRole(tf: Timeframe): { stack: boolean; role: RowRole | null; caption: string | null } {
  const stack = usePanelStore((s) => s.layout === "stack");
  const setupTF = useScanStore((s) => s.active?.tf ?? null);
  const role = stack ? rowRole(tf, setupTF) : null;
  return { stack, role, caption: role ? ROLE_LABEL[role] : null };
}

/** Context rows draw candles at 70% so the focus row reads first, without borders. */
export function useContextCandles(api: ChartApi | null, role: RowRole | null): void {
  useEffect(() => {
    if (!api) return;
    api.setCandleAlpha(role === "context" ? CONTEXT_CANDLE_ALPHA : 1);
  }, [api, role]);
}