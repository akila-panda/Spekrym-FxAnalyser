/** DESK DK7 — plain-text level list (fallback when Pine cannot carry everything, or for notes/chat).
 *  Same objects as the Pine export (as-of folded, spent excluded), highest price first. Pure. */
import { describeObject, fmtTime } from "@/desk/evidence/describe";
import { lifecycleState, viewAsOf } from "@/desk/kernel/viewAsOf";
import { SPENT } from "@/desk/prepare/walk";
import type { AnalysisObject, Snapshot } from "@/desk/types/schemas";
import type { Timeframe } from "@/types/market";

export const oneLine = (s: string): string => s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();

export const activeObjects = (snap: Snapshot): { active: AnalysisObject[]; spent: number } => {
  const known = viewAsOf(snap.objects, snap.as_of);
  const active = known.filter((o) => !SPENT.has(lifecycleState(o) ?? ""));
  return { active, spent: known.length - active.length };
};

const top = (o: AnalysisObject): number =>
  o.geometry.bands.length ? Math.max(...o.geometry.bands.map((b) => b.pHigh)) : o.geometry.points?.[0]?.p ?? 0;

export function toPlainList(snap: Snapshot): string {
  const { active } = activeObjects(snap);
  const stamp = snap.dataKind === "sample" ? "SAMPLE" : "LIVE";
  const head = [
    `Spekrym-FX Desk — ${snap.pair.replace("_", "/")} ${snap.date} [${stamp}]`,
    `snapshot ${snap.id} · rules ${snap.rulesVersion} · as of ${fmtTime(snap.as_of)}`,
    ...(snap.notes ? [`notes: ${oneLine(snap.notes)}`] : []),
    "",
  ];
  const rows = [...active]
    .sort((a, b) => top(b) - top(a) || (a.id < b.id ? -1 : 1))
    .map((o) => `- ${describeObject(o, "headline", { viewTf: o.source_tf as Timeframe }).headline}`);
  return [...head, ...(rows.length ? rows : ["No active accepted levels."])].join("\n");
}