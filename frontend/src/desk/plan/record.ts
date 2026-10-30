/** DESK DK16 — pure plan helpers: build a Decision record (frozen evidence + bias + rulesVersion + as-of),
 *  filter the journal, and render a static text snapshot. Nothing with known_at after as_of can enter the record
 *  (same viewAsOf path as the chart). No buy/sell wording, no probabilities. */
import { canonicalHash } from "@/desk/lib/hash";
import { describeObject, fmtTime } from "@/desk/evidence/describe";
import { viewAsOf } from "@/desk/kernel/viewAsOf";
import type { AnalysisObject } from "@/desk/types/schemas";
import { JournalEntrySchema, PlanSchema, type Bias, type JournalEntry, type Outcome, type Plan } from "./types";

export const planKey = (pair: string, date: string): string => `${pair}|${date}`;

export function emptyPlan(pair: Plan["pair"], date: string, now: number): Plan {
  return PlanSchema.parse({ id: `plan:${planKey(pair, date)}`, pair, date, updated_at: now });
}

export const parseTags = (raw: string): string[] =>
  [...new Set(raw.split(/[,\s]+/).map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 10).map((t) => t.slice(0, 30));

export interface RecordInput {
  plan: Plan;
  bias: Bias;
  briefState: string;
  as_of: number;
  rulesVersion: string;
  dataKind: "sample" | "live";
  /** Every object currently known (any TF); only the plan's linked ones are frozen into the entry. */
  objects: readonly AnalysisObject[];
  tags: readonly string[];
  note: string;
  recorded_at: number;
}

export type RecordResult = { ok: true; entry: JournalEntry } | { ok: false; reason: string };

export function buildEntry(i: RecordInput): RecordResult {
  if (!i.plan.idea.trim()) return { ok: false, reason: "Add the idea before recording." };
  if (!i.plan.invalidation.trim()) return { ok: false, reason: "Add what would invalidate the idea before recording." };
  const linked = new Set(i.plan.linkedObjectIds);
  const evidence = viewAsOf(i.objects, i.as_of).filter((o) => linked.has(o.id));
  const id = `jr:${i.plan.pair}:${i.plan.date}:${canonicalHash([i.recorded_at, i.as_of, i.bias, i.plan, i.note])}`;
  const p = JournalEntrySchema.safeParse({
    id, pair: i.plan.pair, date: i.plan.date, recorded_at: i.recorded_at, as_of: i.as_of, rulesVersion: i.rulesVersion,
    dataKind: i.dataKind, bias: i.bias, briefState: i.briefState, plan: i.plan, evidence, tags: [...i.tags], note: i.note.trim(),
  });
  return p.success ? { ok: true, entry: p.data } : { ok: false, reason: "The plan has invalid values." };
}

export interface JournalFilter { pair?: string; bias?: Bias | ""; tag?: string; result?: Outcome["result"] | "none" | ""; text?: string }

/** Newest first. `result: "none"` = no outcome recorded yet. */
export function filterJournal(entries: readonly JournalEntry[], outcomes: Readonly<Record<string, Outcome>>, f: JournalFilter): JournalEntry[] {
  const q = (f.text ?? "").trim().toLowerCase();
  return entries
    .filter((e) => !f.pair || e.pair === f.pair)
    .filter((e) => !f.bias || e.bias === f.bias)
    .filter((e) => !f.tag || e.tags.includes(f.tag.toLowerCase()))
    .filter((e) => !f.result || (f.result === "none" ? !outcomes[e.id] : outcomes[e.id]?.result === f.result))
    .filter((e) => !q || [e.plan.idea, e.plan.confirm, e.plan.invalidation, e.note, e.tags.join(" ")].join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.recorded_at - a.recorded_at);
}

/** Plain-text static snapshot of one entry (and its outcome, shown as judged separately). */
export function entryText(e: JournalEntry, outcome?: Outcome): string {
  const L = [
    `Spekrym-FX Desk — decision record${e.dataKind === "sample" ? " (SAMPLE DATA)" : ""}`,
    `${e.pair.replace("_", "/")} · ${e.date} · bias: ${e.bias} · brief: ${e.briefState}`,
    `As-of ${fmtTime(e.as_of)} · recorded ${fmtTime(e.recorded_at)} · rules ${e.rulesVersion}`,
    "", `Idea: ${e.plan.idea}`, `Confirmation: ${e.plan.confirm || "—"}`, `Invalidation: ${e.plan.invalidation}`,
    `Target: ${e.plan.targetR ?? "—"} R · Risk: ${e.plan.riskPct ?? "—"} %`,
    "", `Evidence (${e.evidence.length}):`, ...e.evidence.map((o) => `- ${describeObject(o, "headline").headline}`),
  ];
  if (e.tags.length) L.push("", `Tags: ${e.tags.join(", ")}`);
  if (e.note) L.push("", `Note: ${e.note}`);
  L.push("", outcome
    ? `Outcome (recorded separately ${fmtTime(outcome.set_at)}): ${outcome.result}${outcome.r !== null ? ` · ${outcome.r} R` : ""}${outcome.followedPlan === null ? "" : outcome.followedPlan ? " · followed plan" : " · deviated from plan"}${outcome.note ? ` · ${outcome.note}` : ""}`
    : "Outcome: not recorded yet");
  return L.join("\n");
}