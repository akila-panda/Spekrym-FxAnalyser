/** DESK DK18 — Evidence Timeline. Pure: facts in the order they became knowable (formed · lifecycle · confirmed · your decision).
 *  Everything goes through the one viewAsOf path, so nothing after the as-of can appear. Copy is descriptive, never a forecast. */
import { typeName } from "@/desk/evidence/describe";
import { viewAsOf } from "@/desk/kernel/viewAsOf";
import type { AnalysisObject, Decision } from "@/desk/types/schemas";

export const TIMELINE = { windowSec: 48 * 3600, cap: 60 } as const;
export type TimelineKind = "formed" | "lifecycle" | "confirmed" | "decision";
export interface TimelineEntry { id: string; kind: TimelineKind; /** known_at of the fact (UTC s). */ t: number; objectId: string; tf: string; text: string }

const DECISION_TEXT: Record<Decision["action"], string> = {
  accept: "You accepted this object", reject: "You rejected this object", revisit: "You marked this object to revisit", custom: "You added this custom level",
};
const words = (k: string): string => k.replace(/_/g, " ");
const dayStart = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);

export interface TimelineInput {
  objects: readonly AnalysisObject[];
  decisions?: readonly Decision[];
  ref: number;
  /** Restrict to one object (full history, no window). */
  selectedId?: string | null;
}

export function buildTimeline({ objects, decisions = [], ref, selectedId = null }: TimelineInput): TimelineEntry[] {
  const known = viewAsOf(objects, ref);
  const byId = new Map(known.map((o) => [o.id, o]));
  const out: TimelineEntry[] = [];
  for (const o of known) {
    const base = { objectId: o.id, tf: o.source_tf };
    const name = `${typeName(o)} ${o.source_tf}`;
    out.push({ ...base, id: `${o.id}|formed`, kind: "formed", t: o.known_at, text: `${name} formed` });
    for (const e of o.lifecycle) out.push({ ...base, id: `${o.id}|${e.kind}@${e.t}`, kind: "lifecycle", t: e.known_at, text: `${name} — ${words(e.kind)}` });
    if (o.confirmed_at !== null) out.push({ ...base, id: `${o.id}|confirmed`, kind: "confirmed", t: o.confirmed_at, text: `${name} confirmed` });
  }
  for (const d of decisions) {
    // Decisions carry real wall-clock decided_at, which is not comparable to sample-data time: anchor on the trading date.
    const t = dayStart(d.date);
    if (!Number.isFinite(t) || t > ref) continue;
    const o = byId.get(d.objectId);
    out.push({ id: `${d.id}|decision`, kind: "decision", t, objectId: d.objectId, tf: o?.source_tf ?? "", text: `${DECISION_TEXT[d.action]}${o ? ` (${typeName(o)} ${o.source_tf})` : ""}` });
  }
  const scoped = selectedId ? out.filter((e) => e.objectId === selectedId) : out.filter((e) => e.t > ref - TIMELINE.windowSec);
  return scoped.sort((a, b) => b.t - a.t || a.id.localeCompare(b.id)).slice(0, TIMELINE.cap);
}