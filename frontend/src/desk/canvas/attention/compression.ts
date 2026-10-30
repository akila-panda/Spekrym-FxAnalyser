/** F20 — Decision Compression. Pure + causal. Reduces the ranked attention list + the Market Change Feed to THREE answers:
 *  "What matters" · "Watch next" · "What changes". Every answer is always present (explicit empty text, never blank).
 *  It selects and phrases existing items only — no new claims, no probabilities. P0 is never trimmed or muted away. */
import type { ChangeEvent } from "../live/diff";
import type { AttentionEntry } from "./attention";

export interface Line { id: string; text: string; tier?: string; glyph: string }
export interface Compression { matters: Line[]; watchNext: Line[]; changes: Line[]; thesisIntact: boolean }

export const MATTERS_MAX = 3;
export const WATCH_MAX = 3;
export const CHANGE_WINDOW_SEC = 3600;
const CAT: Record<string, string> = {
  expected: "planned level reached", unexpected: "unexpected break", confirmed: "confirmation met",
  invalidated: "INVALIDATED", deteriorated: "conditions deteriorated",
};

export function compress(
  entries: readonly AttentionEntry[],
  opts: { asOf: number; feed?: readonly ChangeEvent[]; feedAsOf?: number; reachedIds?: readonly string[] },
): Compression {
  const feedAsOf = opts.feedAsOf ?? opts.asOf;
  const feed = (opts.feed ?? []).filter((e) => e.t <= feedAsOf && e.category !== "no_change");
  const thesisIntact = !feed.some((e) => e.category === "invalidated");
  const reached = new Set(opts.reachedIds ?? []);

  // What matters: every P0 (never trimmed) + the top ranked non-muted others up to the budget.
  const live = entries.filter((e) => !e.muted);
  const p0 = live.filter((e) => e.tier === "P0");
  const rest = live.filter((e) => e.tier !== "P0").slice(0, MATTERS_MAX);
  const matters: Line[] = [...p0, ...rest].map((e) => ({
    id: e.item.id, tier: e.tier, glyph: e.tier === "P0" ? "⚠" : e.pinned ? "⚑" : "●",
    text: `${e.item.engine} · ${e.item.label} — ${e.pinned ? "pinned by you" : e.reason}`,
  }));
  if (!thesisIntact) matters.unshift({ id: "thesis", tier: "P0", glyph: "⚠", text: "Plan thesis invalidated — an explicit invalidation condition triggered" });

  // Watch next: open scenarios + planned objects not yet reached (non-P0, non-muted).
  const watchSrc = live.filter((e) => e.tier !== "P0" && (e.item.evidenceType === "conditional_scenario" || (e.inPlan && !reached.has(e.item.id))));
  const watchNext: Line[] = watchSrc.slice(0, WATCH_MAX).map((e) => ({
    id: e.item.id, tier: e.tier, glyph: e.item.evidenceType === "conditional_scenario" ? "◇" : "◎",
    text: e.item.evidenceType === "conditional_scenario" ? `${e.item.label} — trigger / invalidation pending` : `${e.item.label} — planned level not reached yet`,
  }));

  // What changes: newly-knowable items in the window + classified live facts (newest first).
  const fresh = entries.filter((e) => opts.asOf - e.item.availableAt <= CHANGE_WINDOW_SEC && e.item.availableAt <= opts.asOf);
  const changes: Line[] = [
    ...[...feed].sort((a, b) => b.t - a.t || a.id.localeCompare(b.id)).map((e) => ({
      id: `chg:${e.id}`, glyph: e.category === "invalidated" ? "⚠" : "Δ", text: `${CAT[e.category] ?? e.category}${e.inPlan ? " (in plan)" : ""}`,
    })),
    ...fresh.map((e) => ({ id: `new:${e.item.id}`, glyph: "Δ", text: `new: ${e.item.engine} · ${e.item.label}` })),
  ];

  return {
    matters: matters.length ? matters : [{ id: "none", glyph: "—", text: "Nothing needs attention right now." }],
    watchNext: watchNext.length ? watchNext : [{ id: "none", glyph: "—", text: "No open triggers to watch." }],
    changes: changes.length ? changes : [{ id: "none", glyph: "—", text: "No change in the last hour." }],
    thesisIntact,
  };
}