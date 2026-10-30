/** DESK DK6 — user decisions (accept / reject / revisit / custom). Own store, local only, never replicated.
 *  One decision per (pair, date, objectId); `decided_at` is the moment of the user's decision, not the object's.
 *  Persisted at spekrym.desk.decisions.v1 (quota-guarded: oldest dropped first). */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";
import { DecisionSchema, type Decision } from "@/desk/types/schemas";

export const MAX_DECISIONS = 3000;
export const decisionKey = (pair: string, date: string, objectId: string): string => `${pair}|${date}|${objectId}`;

export function parseDecisions(raw: unknown): Decision[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, Decision>();
  for (const r of raw) {
    const p = DecisionSchema.safeParse(r);
    if (p.success) out.set(decisionKey(p.data.pair, p.data.date, p.data.objectId), p.data);
  }
  return [...out.values()].slice(-MAX_DECISIONS);
}

const store = createLocalStore<Decision[]>({ name: "decisions", version: 1, parse: parseDecisions, empty: () => [] });

export interface DecisionInput {
  pair: Decision["pair"]; date: string; objectId: string; action: Decision["action"];
  note?: string; rulesVersion: string; decided_at: number;
}

interface DecisionState {
  decisions: Decision[];
  /** Records a decision; returns the one it replaced (for undo). */
  decide: (d: DecisionInput) => Decision | null;
  /** Puts `prev` back (or removes the decision when `prev` is null). */
  restore: (pair: string, date: string, objectId: string, prev: Decision | null) => void;
  clear: () => void;
}

export const useDecisionStore = create<DecisionState>()((set, get) => ({
  decisions: store.load(),
  decide: (d) => {
    const key = decisionKey(d.pair, d.date, d.objectId);
    const prev = get().decisions.find((x) => decisionKey(x.pair, x.date, x.objectId) === key) ?? null;
    const next: Decision = { id: key, ...d };
    set((s) => ({ decisions: [...s.decisions.filter((x) => x !== prev), next].slice(-MAX_DECISIONS) }));
    return prev;
  },
  restore: (pair, date, objectId, prev) => {
    const key = decisionKey(pair, date, objectId);
    set((s) => {
      const rest = s.decisions.filter((x) => decisionKey(x.pair, x.date, x.objectId) !== key);
      return { decisions: prev ? [...rest, prev] : rest };
    });
  },
  clear: () => set({ decisions: [] }),
}));

useDecisionStore.subscribe((s, p) => {
  if (s.decisions === p.decisions) return;
  if (!store.save(s.decisions)) store.save(s.decisions.slice(Math.floor(s.decisions.length / 4)));
});

/** Decisions for one pair+day, keyed by object id. */
export const decisionsForDay = (all: readonly Decision[], pair: string, date: string): Map<string, Decision> =>
  new Map(all.filter((d) => d.pair === pair && d.date === date).map((d) => [d.objectId, d]));