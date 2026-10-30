/** DESK DK16 — trade plans (one per pair+date; editable until recorded). Own store, local only, never replicated.
 *  Persisted at spekrym.desk.plans.v1 (quota-guarded: oldest dropped first). */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";
import { planKey } from "./record";
import { PlanSchema, type Plan } from "./types";

export const MAX_PLANS = 400;

export function parsePlans(raw: unknown): Plan[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, Plan>();
  for (const r of raw) { const p = PlanSchema.safeParse(r); if (p.success) out.set(planKey(p.data.pair, p.data.date), p.data); }
  return [...out.values()].slice(-MAX_PLANS);
}

const store = createLocalStore<Plan[]>({ name: "plans", version: 1, parse: parsePlans, empty: () => [] });

interface PlanState {
  plans: Plan[];
  save: (p: Plan) => boolean;
  clear: () => void;
}

export const usePlanStore = create<PlanState>()((set) => ({
  plans: store.load(),
  save: (p) => {
    const ok = PlanSchema.safeParse(p);
    if (!ok.success) return false;
    set((s) => ({ plans: [...s.plans.filter((x) => planKey(x.pair, x.date) !== planKey(p.pair, p.date)), ok.data].slice(-MAX_PLANS) }));
    return true;
  },
  clear: () => set({ plans: [] }),
}));

usePlanStore.subscribe((s, p) => {
  if (s.plans === p.plans) return;
  if (!store.save(s.plans)) store.save(s.plans.slice(Math.floor(s.plans.length / 4)));
});

export const planFor = (all: readonly Plan[], pair: string, date: string): Plan | undefined =>
  all.find((p) => p.pair === pair && p.date === date);