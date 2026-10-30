/** DESK DK19 — ephemeral scorecard run (never persisted, never replicated). Computes on demand, yielding between units so the UI
 *  stays responsive. Reads the methodology it is given; it never writes to the methodology store (no auto-tuning). */
import { create } from "zustand";
import { detectAll } from "@/desk/detect";
import { runKernel } from "@/desk/kernel/kernel";
import type { DEFAULTS } from "@/desk/methodology/defaults";
import { deepCandles } from "@/desk/mock/deepMock";
import { PAIRS, type Pair } from "@/types/market";
import { observePair, type Obs, type TfData } from "./observe";
import { SCORE_TFS } from "./protocol";

type Cfg = typeof DEFAULTS;
interface State {
  status: "idle" | "running" | "done";
  /** 0..1 */
  progress: number;
  rulesVersion: string | null;
  obs: Obs[];
  run: (cfg: Cfg, rulesVersion: string, opts?: { pairs?: readonly Pair[] }) => Promise<void>;
  clear: () => void;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
let token = 0;

export const useScorecardStore = create<State>()((set) => ({
  status: "idle", progress: 0, rulesVersion: null, obs: [],
  run: async (cfg, rulesVersion, opts = {}) => {
    const mine = ++token;
    const pairs = opts.pairs ?? PAIRS;
    const total = pairs.length * SCORE_TFS.length;
    let done = 0;
    const all: Obs[] = [];
    set({ status: "running", progress: 0 });
    for (const pair of pairs) {
      const data: TfData[] = [];
      for (const tf of SCORE_TFS) {
        const candles = deepCandles(pair, tf);
        const last = candles[candles.length - 1];
        const r = detectAll({ candles, pair, tf, asOf: Infinity, dataKind: "sample", dataVersion: `${candles.length}:${last?.time ?? 0}` }, cfg);
        data.push({ tf, objects: r.objects, kernel: runKernel(candles, { pair, tf, asOf: Infinity }, cfg) });
        done += 1;
        if (mine !== token) return;
        set({ progress: done / total });
        await tick();
        if (mine !== token) return;
      }
      all.push(...observePair(pair, data, cfg));
    }
    set({ status: "done", progress: 1, rulesVersion, obs: all });
  },
  clear: () => { token += 1; set({ status: "idle", progress: 0, rulesVersion: null, obs: [] }); },
}));