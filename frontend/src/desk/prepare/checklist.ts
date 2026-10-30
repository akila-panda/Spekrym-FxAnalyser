/** DESK DK6 — top-down checklist. A step is reviewed when the trader marks it, or when it has candidates and
 *  every one is triaged (auto). An explicit mark overrides auto in both directions. Pure. */
import type { InboxItem, Step } from "./walk";
import { STEPS } from "./walk";

export interface ChecklistItem {
  step: Step; total: number; triaged: number;
  /** Fully triaged with at least one candidate. An empty step is never auto-ticked. */
  auto: boolean;
  /** Trader's explicit mark: true = reviewed, false = not reviewed, undefined = follow auto. */
  override: boolean | undefined;
  done: boolean;
}

export function buildChecklist(
  inbox: Record<Step, readonly InboxItem[]>, reviewed: Partial<Record<Step, boolean>>,
): ChecklistItem[] {
  return STEPS.map((step) => {
    const items = inbox[step] ?? [];
    const triaged = items.filter((i) => i.triage !== null).length;
    const auto = items.length > 0 && triaged === items.length;
    const override = reviewed[step];
    return { step, total: items.length, triaged, auto, override, done: override ?? auto };
  });
}

export const reviewedSteps = (c: readonly ChecklistItem[]): Step[] => c.filter((i) => i.done).map((i) => i.step);