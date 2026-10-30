import type { Condition, Setup } from "@/types";

export interface RejectionCount {
  key: string;
  label: string;
  count: number;
}

/** The first condition (in the backend's order) that failed. `null` (not applicable) never counts. */
export const firstFailed = (s: Setup): Condition | undefined => s.conditions.find((c) => c.passed === false);

/** Rejected candidates grouped by first failed condition. Highest count first; ties by key. Pure. */
export function rejectionCounts(setups: readonly Setup[]): RejectionCount[] {
  const m = new Map<string, RejectionCount>();
  for (const s of setups) {
    if (s.status !== "rejected") continue;
    const c = firstFailed(s);
    if (!c) continue;
    const cur = m.get(c.key);
    if (cur) cur.count += 1;
    else m.set(c.key, { key: c.key, label: c.label, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export const matchesFailedCondition = (s: Setup, key: string): boolean =>
  s.status === "rejected" && firstFailed(s)?.key === key;