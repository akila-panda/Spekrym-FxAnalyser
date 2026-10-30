/** S3: global Focus + DrillHistory + per-row detached flags. Window-scoped: NOT replicated (see docs/state-classification.md). */
import { create } from "zustand";
import { bucketStart, TF_SECONDS, type Timeframe } from "@/types/market";
import type { Focus } from "./viewportPolicy";

interface FocusState {
  focus: Focus | null;
  /** Previous foci, oldest first. `back()` pops without recompute. */
  history: readonly Focus[];
  /** Rows the user panned/zoomed locally. They ignore focus changes until re-snapped. */
  detached: ReadonlySet<Timeframe>;
  /** Bumped by `alignAll`; rows re-apply their viewport when it changes. */
  alignNonce: number;
  setFocus: (f: Focus) => void;
  /** Focus on the parent bucket containing `t`. */
  focusAt: (t: number, parentTF: Timeframe) => void;
  setDetached: (tf: Timeframe, on: boolean) => void;
  resnap: (tf: Timeframe) => void;
  resnapAll: () => void;
  /** Re-snap every row AND re-apply every viewport to the current Focus, even when nothing is detached. */
  alignAll: () => void;
  back: () => void;
  /** S6: pop until `drillDepth` <= depth (breadcrumb jump). No recompute. */
  backTo: (depth: number) => void;
  /** S6: enter the last focus of `chain`, keeping the earlier ones as breadcrumb history. Re-snaps every row. */
  drill: (chain: readonly Focus[]) => void;
  reset: () => void;
}

const same = (a: Focus | null, b: Focus): boolean =>
  !!a && a.parentTF === b.parentTF && a.interval[0] === b.interval[0] && a.interval[1] === b.interval[1] && a.drillDepth === b.drillDepth;

export const useFocusStore = create<FocusState>()((set, get) => ({
  focus: null,
  history: [],
  detached: new Set<Timeframe>(),
  alignNonce: 0,
  setFocus: (f) => {
    const cur = get().focus;
    if (same(cur, f)) return;
    set({ focus: f, history: cur ? [...get().history, cur].slice(-50) : get().history });
  },
  focusAt: (t, parentTF) => {
    const open = bucketStart(parentTF, t);
    get().setFocus({ anchor: t, interval: [open, open + TF_SECONDS[parentTF]], parentTF, drillDepth: 0 });
  },
  setDetached: (tf, on) =>
    set((s) => {
      if (s.detached.has(tf) === on) return {};
      const next = new Set(s.detached);
      if (on) next.add(tf);
      else next.delete(tf);
      return { detached: next };
    }),
  resnap: (tf) => get().setDetached(tf, false),
  resnapAll: () => set({ detached: new Set<Timeframe>() }),
  alignAll: () => set((s) => ({ detached: new Set<Timeframe>(), alignNonce: s.alignNonce + 1 })),
  back: () => {
    const h = get().history;
    const prev = h[h.length - 1];
    if (prev) set({ focus: prev, history: h.slice(0, -1) });
  },
  backTo: (depth) => {
    let { focus, history } = get();
    while (focus && focus.drillDepth > depth && history.length > 0) {
      focus = history[history.length - 1]!;
      history = history.slice(0, -1);
    }
    set({ focus, history });
  },
  drill: (chain) => {
    const last = chain[chain.length - 1];
    if (!last) return;
    const { focus: cur, history } = get();
    if (same(cur, last)) return;
    const next = [...history, ...(cur ? [cur] : []), ...chain.slice(0, -1)].slice(-50);
    set((s) => ({ focus: last, history: next, detached: new Set<Timeframe>(), alignNonce: s.alignNonce + 1 }));
  },
  reset: () => set({ focus: null, history: [], detached: new Set<Timeframe>(), alignNonce: 0 }),
}));