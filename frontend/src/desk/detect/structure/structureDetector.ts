/** DESK DK4 — structure detector: labelled swings, BOS/CHoCH events, protected high/low.
 *  Swing ids match the sample detector's (same anchors) so this one supersedes it when registered first.
 *  structure_event anchorTimes = [barTime, levelTime, code] (1 BOS · 2 CHoCH) · protected = [levelTime, 3]. */
import { objectId } from "@/desk/lib/ids";
import { DEFAULTS } from "@/desk/methodology/defaults";
import type { AnalysisObject, Grade, LifecycleEvent } from "@/desk/types/schemas";
import type { Detector } from "../registry";
import { analyzeStructure, type StructEvent } from "./analyze";
import { PROTECTED_CODE } from "./kinds";

const CODE = { BOS: 1, CHoCH: 2 } as const;
const fmt = (p: number): string => p.toFixed(5);

export const structureDetector: Detector = {
  id: "structure",
  version: 1,
  run(k, ctx) {
    const cfg = ctx.cfg ?? DEFAULTS;
    const res = analyzeStructure(k, cfg);
    const provenance = { rulesVersion: ctx.rulesVersion, dataKind: ctx.dataKind, detector: "structure", detectorVersion: 1 };
    const rule = cfg.structure.breakRule;
    const out: AnalysisObject[] = [];

    for (const { swing: s, label } of res.swings) {
      const isHigh = s.kind === "high";
      const anchors = [s.time, isHigh ? 1 : 0];
      out.push({
        id: objectId({ type: "swing", pair: ctx.pair, tf: ctx.tf, anchorTimes: anchors }),
        type: "swing", layer: "structure", pair: ctx.pair, source_tf: ctx.tf,
        direction: isHigh ? "bear" : "bull",
        geometry: { bands: [{ pHigh: s.price, pLow: s.price }], points: [{ t: s.time, p: s.price }], anchorTimes: anchors },
        t_event: s.time, known_at: s.known_at, confirmed_at: null, lifecycle: [],
        grade: {
          significance: null, relevance: null, quality: null, freshness: null,
          factors: [
            { id: "scale", label: `${s.n}-bar swing on each side`, status: "supports", value: s.n },
            ...(label ? [{ id: "label", label, status: "supports" as const }] : []),
          ],
        },
        provenance,
        evidence: [{ t: s.time, note: `${label ? `${label}: ` : ""}extreme of ${s.n} bars each side; confirmed ${s.n} bars later.` }],
      });
    }

    const evObj = (e: StructEvent): AnalysisObject => {
      const anchors = [e.barTime, e.level.time, CODE[e.kind]];
      const lifecycle: LifecycleEvent[] = e.failed_at !== null
        ? [{ kind: "invalidated", t: e.failed_at, known_at: e.failed_at, detail: { reason: "failed_choch" } }]
        : [];
      const side = e.dir === "bull" ? "above swing high" : "below swing low";
      const factors: Grade["factors"] = [
        { id: "rule", label: `Break rule: ${rule}`, status: "supports" },
        { id: "prior", label: `Prior trend: ${e.priorTrend}`, status: "supports" },
      ];
      if (e.kind === "CHoCH") {
        factors.push(e.failed_at !== null
          ? { id: "follow", label: "Price later closed back beyond the prior extreme", status: "opposes" }
          : e.confirmed_at !== null
            ? { id: "follow", label: "Later swings confirmed the new direction", status: "supports" }
            : { id: "follow", label: "Not yet confirmed by later swings", status: "unavailable" });
      }
      return {
        id: objectId({ type: "structure_event", pair: ctx.pair, tf: ctx.tf, anchorTimes: anchors }),
        type: "structure_event", layer: "structure", pair: ctx.pair, source_tf: ctx.tf, direction: e.dir,
        geometry: {
          bands: [{ pHigh: e.level.price, pLow: e.level.price }],
          points: [{ t: e.level.time, p: e.level.price }, { t: e.barTime, p: e.level.price }],
          anchorTimes: anchors,
        },
        t_event: e.barTime, known_at: e.known_at, confirmed_at: e.confirmed_at, lifecycle,
        grade: { significance: null, relevance: null, quality: null, freshness: null, factors },
        provenance,
        evidence: [{
          t: e.barTime,
          note: e.kind === "BOS"
            ? `Closed ${side} ${fmt(e.level.price)} in a ${e.priorTrend} structure (continuation).`
            : `Potential change of character: closed ${side} ${fmt(e.level.price)} against a ${e.priorTrend} structure.`,
        }],
      };
    };
    for (const e of res.events) out.push(evObj(e));

    for (const p of res.protectedLevels) {
      const anchors = [p.swing.time, PROTECTED_CODE];
      out.push({
        id: objectId({ type: "structure_event", pair: ctx.pair, tf: ctx.tf, anchorTimes: anchors }),
        type: "structure_event", layer: "structure", pair: ctx.pair, source_tf: ctx.tf,
        direction: p.side === "low" ? "bull" : "bear",
        geometry: { bands: [{ pHigh: p.swing.price, pLow: p.swing.price }], points: [{ t: p.swing.time, p: p.swing.price }], anchorTimes: anchors },
        t_event: p.swing.time, known_at: p.known_at, confirmed_at: null,
        lifecycle: p.ended ? [{ kind: p.ended.kind, t: p.ended.known_at, known_at: p.ended.known_at }] : [],
        grade: {
          significance: null, relevance: null, quality: null, freshness: null,
          factors: [{ id: "protected", label: `Protected ${p.side} of the current trend`, status: "supports" }],
        },
        provenance,
        evidence: [{ t: p.swing.time, note: `Swing ${p.side} at ${fmt(p.swing.price)}; a ${rule} break of it would be a potential change of character.` }],
      });
    }
    return out;
  },
};