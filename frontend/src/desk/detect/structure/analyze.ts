/** DESK DK4 — causal market-structure walk. Swing-scale swings → HH/HL/LH/LL labels → trend → BOS / CHoCH
 *  (+ protected level). Bars are processed in close order; a swing joins only once confirmed (known_at).
 *  CHoCH = potential change of character, never a reversal call. <2 confirmed swings/side ⇒ transitioning. */
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { KernelResult } from "@/desk/kernel/kernel";
import type { Swing } from "@/desk/kernel/swings";
import { TF_SECONDS } from "@/types/market";

export type Trend = "bull" | "bear" | "transitioning";
export type SwingLabel = "HH" | "HL" | "LH" | "LL" | "EH" | "EL";
export interface StructCfg { structure: { breakRule: "close" | "wick"; minBreakAtr: number } }

export interface LabelledSwing { swing: Swing; label: SwingLabel | null }
export interface StructEvent {
  kind: "BOS" | "CHoCH";
  dir: "bull" | "bear";
  barTime: number;
  known_at: number;
  level: Swing;
  priorTrend: Trend;
  confirmed_at: number | null;
  failed_at: number | null;
}
export interface ProtectedLevel {
  swing: Swing;
  side: "high" | "low";
  known_at: number;
  ended: { kind: "broken" | "superseded"; known_at: number } | null;
}
export interface StructureResult {
  swings: LabelledSwing[];
  events: StructEvent[];
  protectedLevels: ProtectedLevel[];
  trend: Trend;
}

const sk = (s: Swing): string => `${s.time}:${s.kind}`;

export function analyzeStructure(k: KernelResult, cfg: StructCfg = DEFAULTS): StructureResult {
  const { breakRule, minBreakAtr } = cfg.structure;
  const sec = TF_SECONDS[k.tf];
  const pending = [...k.swingsSwing].sort((a, b) => a.confirmIndex - b.confirmIndex || a.index - b.index || (a.kind < b.kind ? -1 : 1));
  const labelled: LabelledSwing[] = [];
  const events: StructEvent[] = [];
  const prot: ProtectedLevel[] = [];
  const protByKey = new Map<string, ProtectedLevel>();
  const broken = new Set<string>();
  let nextSwing = 0;
  let hi: { s: Swing; label: SwingLabel | null } | null = null;
  let lo: { s: Swing; label: SwingLabel | null } | null = null;
  let nHi = 0;
  let nLo = 0;
  let awaiting = false;
  let trend: Trend = "transitioning";
  const st: { pend: StructEvent | null } = { pend: null };
  let pendExtreme = 0;
  let activeProt: ProtectedLevel | null = null;

  for (let i = 0; i < k.bars.length; i++) {
    const bar = k.bars[i]!;
    const ct = bar.time + sec;
    const a = k.atr[i] ?? 0;
    const m = minBreakAtr * a;
    let added = false;

    while (nextSwing < pending.length && (pending[nextSwing] as Swing).confirmIndex <= i) {
      const s = pending[nextSwing++] as Swing;
      const tol = minBreakAtr * (k.atr[s.confirmIndex] ?? 0);
      let label: SwingLabel | null = null;
      if (s.kind === "high") {
        if (hi) label = s.price - hi.s.price > tol ? "HH" : hi.s.price - s.price > tol ? "LH" : "EH";
        hi = { s, label }; nHi++;
      } else {
        if (lo) label = s.price - lo.s.price > tol ? "HL" : lo.s.price - s.price > tol ? "LL" : "EL";
        lo = { s, label }; nLo++;
      }
      labelled.push({ swing: s, label });
      added = true;
    }
    if (added) awaiting = false;

    // failed CHoCH: close back beyond the pre-CHoCH extreme before the trend confirmed
    if (st.pend && st.pend.barTime < bar.time) {
      const failed = st.pend.dir === "bear" ? bar.close > pendExtreme + m : bar.close < pendExtreme - m;
      if (failed) { st.pend.failed_at = ct; st.pend = null; }
    }

    const fromLabels = (): Trend => {
      if (nHi < 2 || nLo < 2 || !hi || !lo) return "transitioning";
      if (hi.label === "HH" && lo.label === "HL") return "bull";
      if (hi.label === "LH" && lo.label === "LL") return "bear";
      return "transitioning";
    };
    trend = awaiting ? "transitioning" : fromLabels();
    if (st.pend && trend === st.pend.dir) { st.pend.confirmed_at = ct; st.pend = null; }

    // protected level of the established trend (known when the trend is)
    const want = trend === "bull" ? lo : trend === "bear" ? hi : null;
    if (activeProt && (!want || want.s !== activeProt.swing) && !activeProt.ended) {
      activeProt.ended = { kind: "superseded", known_at: ct };
    }
    if (want) {
      const key = sk(want.s);
      let p = protByKey.get(key);
      if (!p) {
        p = { swing: want.s, side: want.s.kind, known_at: ct, ended: null };
        protByKey.set(key, p); prot.push(p);
      }
      activeProt = p;
    } else activeProt = null;

    // breaks (levels break once)
    const tryBreak = (up: boolean): void => {
      const lvl = up ? hi : lo;
      if (!lvl || broken.has(sk(lvl.s))) return;
      const px = lvl.s.price;
      const hit = up
        ? (breakRule === "close" ? bar.close : bar.high) > px + m
        : (breakRule === "close" ? bar.close : bar.low) < px - m;
      if (!hit) return;
      broken.add(sk(lvl.s));
      if (trend === "transitioning") return;
      const dir = up ? "bull" : "bear";
      const kind = dir === trend ? "BOS" : "CHoCH";
      const ev: StructEvent = {
        kind, dir, barTime: bar.time, known_at: ct, level: lvl.s, priorTrend: trend,
        confirmed_at: null, failed_at: null,
      };
      events.push(ev);
      if (activeProt && activeProt.swing === lvl.s && !activeProt.ended) {
        activeProt.ended = { kind: "broken", known_at: ct };
        activeProt = null;
      }
      if (kind === "CHoCH") {
        st.pend = ev;
        pendExtreme = (up ? lo : hi)!.s.price;
        awaiting = true;
        trend = "transitioning";
      }
    };
    tryBreak(true);
    tryBreak(false);
  }
  return { swings: labelled, events, protectedLevels: prot, trend };
}