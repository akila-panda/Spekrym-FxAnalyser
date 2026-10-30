/** DX4: row roles derived from timeframe order relative to the selected setup. No implied trades. */
import { TF_SECONDS, type Timeframe } from "@/types/market";

export type RowRole = "context" | "focus" | "detail";

export const ROLE_LABEL: Record<RowRole, string> = { context: "Context", focus: "Focus", detail: "Detail" };

/** Above the setup TF = context, the setup TF = focus, below = detail. Null when no setup is selected. */
export function rowRole(tf: Timeframe, setupTF: Timeframe | null): RowRole | null {
  if (!setupTF) return null;
  const a = TF_SECONDS[tf];
  const b = TF_SECONDS[setupTF];
  return a > b ? "context" : a < b ? "detail" : "focus";
}

export function rowCaption(tf: Timeframe, setupTF: Timeframe | null): string | null {
  const r = rowRole(tf, setupTF);
  return r ? ROLE_LABEL[r] : null;
}