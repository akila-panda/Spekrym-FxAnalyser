/** DESK DK5 — respected support/resistance bands. Reactions cluster by price (cluster tolerance, band cap);
 *  a cluster becomes an object once respected (≥2 reactions; intraday ≥3) or a strong single (≥3 ATR).
 *  Band + direction + grade are frozen at establishment; later facts are lifecycle events
 *  (tested · broken · role_reversed), so nothing after as-of leaks into what is drawn. */
import { objectId } from "@/desk/lib/ids";
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { AnalysisObject, LifecycleEvent } from "@/desk/types/schemas";
import { TF_SECONDS } from "@/types/market";
import type { Detector } from "../registry";
import { findReactions, type Reaction } from "./reactions";

type State = "emerging" | "live" | "broken" | "reversed" | "done" | "dead";
interface Cl {
  first: Reaction; lo: number; hi: number; rs: Reaction[]; lastIdx: number; state: State; strong: boolean;
  est: number | null; fz: { lo: number; hi: number } | null; dir: "bull" | "bear"; touches: number;
  brokenUp: boolean; life: LifecycleEvent[]; ev: Reaction[];
}

export const srDetector: Detector = {
  id: "sr",
  version: 1,
  run(k, ctx) {
    const cfg = ctx.cfg ?? DEFAULTS;
    const L = cfg.levels;
    const sec = TF_SECONDS[ctx.tf];
    const need = sec < 86400 ? L.minReactionsIntraday : L.minReactions;
    const rs0 = findReactions(k, cfg);
    const rx = [
      ...rs0.map((r) => ({ r, strong: false, at: r.knownIndex })),
      ...rs0.filter((r) => r.strongIndex >= 0).map((r) => ({ r, strong: true, at: r.strongIndex })),
    ].sort((a, b) => a.at - b.at || Number(a.strong) - Number(b.strong) || a.r.swing.index - b.r.swing.index || (a.r.side < b.r.side ? -1 : 1));
    const owner = new Map<Reaction, Cl>();
    const all: Cl[] = [];
    let alive: Cl[] = [];
    let ri = 0;

    const establish = (c: Cl, ct: number): void => {
      if (c.rs.length < need && !c.strong) return;
      const highs = c.rs.filter((r) => r.side === "high").length;
      const lows = c.rs.length - highs;
      c.state = "live"; c.est = ct; c.fz = { lo: c.lo, hi: c.hi }; c.touches = c.rs.length;
      c.dir = highs > lows ? "bear" : lows > highs ? "bull" : c.rs[c.rs.length - 1]!.side === "high" ? "bear" : "bull";
      c.ev = c.rs.slice(-4);
      c.life.push({ kind: "established", t: ct, known_at: ct });
    };

    const handle = (r: Reaction, ct: number): void => {
      const tol = L.clusterAtr * r.atr;
      let best: Cl | null = null;
      let bestD = Infinity;
      for (const c of alive) {
        const lo = c.fz?.lo ?? c.lo;
        const hi = c.fz?.hi ?? c.hi;
        const d = r.price < lo ? lo - r.price : r.price > hi ? r.price - hi : 0;
        if (d > tol) continue;
        if (c.state === "broken" && r.side !== (c.brokenUp ? "low" : "high")) continue;
        if (c.state === "emerging" && Math.max(hi, r.bandHi) - Math.min(lo, r.bandLo) > L.bandCapAtr * r.atr) continue;
        if (d < bestD) { best = c; bestD = d; }
      }
      if (!best) {
        const c: Cl = {
          first: r, lo: r.bandLo, hi: r.bandHi, rs: [r], lastIdx: r.swing.index, state: "emerging",
          strong: false, est: null, fz: null, dir: "bull", touches: 0,
          brokenUp: false, life: [], ev: [],
        };
        all.push(c); alive.push(c); owner.set(r, c); establish(c, ct);
        return;
      }
      if (r.swing.index - best.lastIdx < L.minGapBars) return;
      best.lastIdx = r.swing.index;
      owner.set(r, best);
      if (best.state === "emerging") {
        best.rs.push(r);
        best.lo = Math.min(best.lo, r.bandLo); best.hi = Math.max(best.hi, r.bandHi);
        establish(best, ct);
      } else if (best.state === "broken") {
        best.state = "reversed";
        best.life.push({ kind: "role_reversed", t: ct, known_at: ct, detail: { price: r.price } });
      } else {
        const n = best.touches + best.life.filter((e) => e.kind === "tested").length + 1;
        best.life.push({ kind: "tested", t: ct, known_at: ct, detail: { count: n, price: r.price } });
      }
    };

    for (let i = 0; i < k.bars.length; i++) {
      const ct = k.bars[i]!.time + sec;
      while (ri < rx.length && rx[ri]!.at <= i) {
        const e = rx[ri++]!;
        if (!e.strong) { handle(e.r, ct); continue; }
        const c = owner.get(e.r);
        if (c && c.state === "emerging") { c.strong = true; establish(c, ct); }
      }
      const a = k.atr[i];
      if (a == null) continue;
      const m = L.breakAtr * a;
      const close = k.bars[i]!.close;
      let changed = false;
      for (const c of alive) {
        if (c.state === "broken") continue;
        const lo = c.fz?.lo ?? c.lo;
        const hi = c.fz?.hi ?? c.hi;
        // support breaks down, resistance breaks up; a role-reversed level breaks the other way
        let up: boolean;
        if (c.state === "reversed") up = !c.brokenUp;
        else if (c.state === "live") up = c.dir === "bear";
        else {
          const h = c.rs.filter((r) => r.side === "high").length;
          up = h * 2 === c.rs.length ? c.rs[c.rs.length - 1]!.side === "high" : h * 2 > c.rs.length;
        }
        if (up ? !(close > hi + m) : !(close < lo - m)) continue;
        changed = true;
        if (c.state === "emerging") c.state = "dead";
        else {
          c.life.push({ kind: "broken", t: ct, known_at: ct, detail: { dir: up ? "up" : "down", close } });
          c.brokenUp = up;
          c.state = c.state === "reversed" ? "done" : "broken";
        }
      }
      if (changed) alive = alive.filter((c) => c.state !== "dead" && c.state !== "done");
    }

    const provenance = { rulesVersion: ctx.rulesVersion, dataKind: ctx.dataKind, detector: "sr", detectorVersion: 1 };
    const w = L.tfWeight[ctx.tf];
    const out: AnalysisObject[] = [];
    for (const c of all) {
      if (c.est === null || !c.fz) continue;
      const anchors = [c.first.swing.time, c.first.side === "high" ? 21 : 22];
      const base = Math.min(1, c.touches / 4);
      const sig = Math.round(w * Math.max(base, c.strong ? 0.75 : 0) * 100) / 100;
      out.push({
        id: objectId({ type: "sr_level", pair: ctx.pair, tf: ctx.tf, anchorTimes: anchors }),
        type: "sr_level", layer: "levels", pair: ctx.pair, source_tf: ctx.tf, direction: c.dir,
        geometry: { bands: [{ pHigh: c.fz.hi, pLow: c.fz.lo }], anchorTimes: anchors },
        t_event: c.first.swing.time, known_at: c.est, confirmed_at: null, lifecycle: c.life,
        grade: {
          significance: sig, relevance: null, quality: null, freshness: null,
          factors: [
            { id: "touches", label: `${c.touches} respected reaction${c.touches === 1 ? "" : "s"}`, status: "supports", value: c.touches },
            ...(c.strong ? [{ id: "strong", label: `Strong single reaction (≥ ${L.strongSingleAtr} ATR)`, status: "supports" as const }] : []),
            { id: "tf", label: `${ctx.tf} timeframe weight ${w}`, status: "supports", value: w },
          ],
        },
        provenance,
        evidence: c.ev.map((r) => ({
          t: r.swing.time,
          note: `Price turned at ${r.price.toFixed(5)}: moved ${r.departAtr.toFixed(1)} ATR away within ${r.depIndex - r.swing.index} bars without closing through.`,
        })),
      });
    }
    return out;
  },
};