/** F5 — Prepare workflow state (ephemeral; never persisted). Active step, reviewed steps, the trader's
 *  selected objects for the plan, and the frozen plan once produced. */
import { create } from "zustand";
import { PREPARE_STEPS } from "./steps";
import { freezePlan, type SessionPlan } from "./plan";

interface PrepareState {
  stepIndex: number;
  reviewed: Record<string, boolean>;
  selectedIds: string[];
  plan: SessionPlan | null;
  setStep: (i: number) => void;
  markReviewed: (stepId: string) => void;
  toggleSelect: (id: string) => void;
  reset: () => void;
  freeze: (ctx: { pair: string; asOf: number; now?: number }) => void;
}

export const usePrepareStore = create<PrepareState>()((set, get) => ({
  stepIndex: 0,
  reviewed: {},
  selectedIds: [],
  plan: null,
  setStep: (stepIndex) => set({ stepIndex: Math.max(0, Math.min(PREPARE_STEPS.length - 1, stepIndex)) }),
  markReviewed: (stepId) => set((s) => ({ reviewed: { ...s.reviewed, [stepId]: true } })),
  toggleSelect: (id) => set((s) => ({
    selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
  })),
  reset: () => set({ stepIndex: 0, reviewed: {}, selectedIds: [], plan: null }),
  freeze: (ctx) => {
    const s = get();
    const reviewedSteps = PREPARE_STEPS.filter((st) => s.reviewed[st.id]).map((st) => st.id);
    set({ plan: freezePlan({ pair: ctx.pair, asOf: ctx.asOf, createdAt: ctx.now ?? ctx.asOf, reviewedSteps, selectedIds: s.selectedIds }) });
  },
}));
