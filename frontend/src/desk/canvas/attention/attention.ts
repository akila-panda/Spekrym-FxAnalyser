/** F20 — Dynamic Attention (VI-3 sibling). Pure + deterministic + causal. Ranks what deserves the trader's attention
 *  from the cross-engine items already knowable at `asOf` (P0 safety > P1 actionable > P2 evidence > P3 background).
 *  The trader may PIN or MUTE items (presentation only). Overrides never hide anything and never touch P0:
 *  a muted item is moved down but stays listed; muting a P0 item is ignored and surfaced. No scores/probabilities. */
import type { ComposedOverlay } from "../pipeline";
import type { EngineItem } from "../integration/engineLayer";
import { overlayRef } from "../prepare/steps";
import type { SessionPlan } from "../prepare/plan";

export type Tier = "P0" | "P1" | "P2" | "P3";
export interface AttentionOverrides { pinned: readonly string[]; muted: readonly string[] }
export interface AttentionEntry {
  item: EngineItem; tier: Tier; reason: string; inPlan: boolean; pinned: boolean; muted: boolean; rank: number;
}
export interface AttentionResult {
  entries: AttentionEntry[];
  /** Overrides that were ignored (e.g. mute on P0, unknown ids) — surfaced, never silent. */
  ignored: string[];
}

export const STALE_SEC = 6 * 3600;
const TIER_ORDER: Record<Tier, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
export const EMPTY_OVERRIDES: AttentionOverrides = { pinned: [], muted: [] };

/** Ids of engine items that the frozen plan refers to (plan holds overlay refs; resolve to their objects). */
export function planItemIds(plan: SessionPlan | null, overlays: readonly ComposedOverlay[]): Set<string> {
  const out = new Set<string>();
  if (!plan) return out;
  const sel = new Set(plan.selectedIds);
  for (const id of sel) out.add(id);
  for (const o of overlays) if (sel.has(overlayRef(o))) for (const id of o.primary.objectIds) out.add(id);
  return out;
}

function classify(i: EngineItem, inPlan: boolean, asOf: number): { tier: Tier; reason: string } {
  if (i.p0) return { tier: "P0", reason: "safety / invalidation / event risk — always shown" };
  if (inPlan) return { tier: "P1", reason: "in your frozen plan" };
  if (i.evidenceType === "validated_signal") return { tier: "P1", reason: "validated signal" };
  if (i.evidenceType === "conditional_scenario") return { tier: "P1", reason: "scenario trigger to watch" };
  if (asOf - i.availableAt > STALE_SEC) return { tier: "P3", reason: "background — older than 6 h" };
  return { tier: "P2", reason: "supporting evidence" };
}

export function rankAttention(
  items: readonly EngineItem[], opts: { asOf: number; plan?: SessionPlan | null; overlays?: readonly ComposedOverlay[]; overrides?: AttentionOverrides },
): AttentionResult {
  const ov = opts.overrides ?? EMPTY_OVERRIDES;
  const inPlan = planItemIds(opts.plan ?? null, opts.overlays ?? []);
  const known = new Set(items.filter((i) => i.availableAt <= opts.asOf).map((i) => i.id));
  const pinned = new Set(ov.pinned.filter((id) => known.has(id)));
  const mutedReq = new Set(ov.muted.filter((id) => known.has(id)));
  const ignored: string[] = [];
  const entries: Omit<AttentionEntry, "rank">[] = [];
  for (const i of items) {
    if (i.availableAt > opts.asOf) continue; // causal: nothing before it was knowable
    const c = classify(i, inPlan.has(i.id), opts.asOf);
    const canMute = c.tier !== "P0";
    if (mutedReq.has(i.id) && !canMute) ignored.push(`cannot mute P0: ${i.id}`);
    entries.push({ item: i, tier: c.tier, reason: c.reason, inPlan: inPlan.has(i.id), pinned: pinned.has(i.id), muted: mutedReq.has(i.id) && canMute });
  }
  const bucket = (e: Omit<AttentionEntry, "rank">) => (e.tier === "P0" ? 0 : e.muted ? 3 : e.pinned ? 1 : 2);
  entries.sort((a, b) =>
    bucket(a) - bucket(b) || TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.item.availableAt - a.item.availableAt || a.item.id.localeCompare(b.item.id));
  return { entries: entries.map((e, n) => ({ ...e, rank: n + 1 })), ignored: ignored.sort() };
}