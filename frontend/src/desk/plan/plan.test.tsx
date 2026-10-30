import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mkObj } from "@/desk/__fixtures__/objects";
import { JournalBody } from "./PlanWidgets";
import { useJournalStore, parseJournal } from "./journalStore";
import { parsePlans, usePlanStore } from "./planStore";
import { buildEntry, emptyPlan, entryText, filterJournal, parseTags, type RecordInput } from "./record";
import type { Outcome } from "./types";

const T = 1_740_000_000;
const obj = (known_at: number, extra: NonNullable<Parameters<typeof mkObj>[0]> = {}) => mkObj({ source_tf: "H4", direction: "bull", lo: 1.0995, hi: 1.1005, known_at, ...extra });
const A = obj(T - 100);
const base = (over: Partial<RecordInput> = {}): RecordInput => {
  const a = A;
  return {
    plan: { ...emptyPlan("EUR_USD", "2025-02-19", T), idea: "H4 demand holds", invalidation: "Close below the zone", linkedObjectIds: [a.id] },
    bias: "bullish", briefState: "Watching", as_of: T, rulesVersion: "rabc", dataKind: "sample", objects: [a], tags: ["london"], note: "n", recorded_at: T + 5, ...over,
  };
};
const ok = (i: RecordInput) => { const r = buildEntry(i); if (!r.ok) throw new Error(r.reason); return r.entry; };
const BAD = /\b(buy|sell|reversal|likely|probab\w*|will)\b/i;

describe("buildEntry", () => {
  it("freezes evidence, bias, rulesVersion, as-of; id is stable per input", () => {
    const e = ok(base());
    expect(e).toMatchObject({ bias: "bullish", rulesVersion: "rabc", as_of: T, dataKind: "sample", briefState: "Watching" });
    expect(e.evidence).toHaveLength(1);
    expect(ok(base()).id).toBe(e.id);
    expect(ok(base({ note: "other" })).id).not.toBe(e.id);
  });
  it("requires idea and invalidation", () => {
    const i = base();
    expect(buildEntry({ ...i, plan: { ...i.plan, idea: " " } })).toMatchObject({ ok: false });
    expect(buildEntry({ ...i, plan: { ...i.plan, invalidation: "" } })).toMatchObject({ ok: false });
  });
  it("no lookahead: objects known after as-of never enter the record", () => {
    const early = obj(T - 100);
    const late = obj(T + 500, { source_tf: "H1", lo: 1.2, hi: 1.201 });
    const i = base({ objects: [early, late], plan: { ...base().plan, linkedObjectIds: [early.id, late.id] } });
    expect(ok(i).evidence.map((o) => o.id)).toEqual([early.id]);
  });
  it("only linked objects are frozen", () => {
    const a = obj(T - 100); const b = obj(T - 90, { source_tf: "H1", lo: 1.2, hi: 1.201 });
    expect(ok(base({ objects: [a, b], plan: { ...base().plan, linkedObjectIds: [b.id] } })).evidence.map((o) => o.id)).toEqual([b.id]);
  });
});

describe("filter + text", () => {
  const e1 = ok(base());
  const e2 = ok(base({ recorded_at: T + 50, tags: ["ny"], bias: "bearish", plan: { ...base().plan, idea: "Supply rejects", invalidation: "x" } }));
  const out: Record<string, Outcome> = { [e1.id]: { result: "win", r: 2, followedPlan: true, note: "", set_at: T + 99 } };
  it("newest first and filters by bias/tag/outcome/text/pair", () => {
    expect(filterJournal([e1, e2], out, {}).map((e) => e.id)).toEqual([e2.id, e1.id]);
    expect(filterJournal([e1, e2], out, { bias: "bearish" })).toEqual([e2]);
    expect(filterJournal([e1, e2], out, { tag: "london" })).toEqual([e1]);
    expect(filterJournal([e1, e2], out, { result: "none" })).toEqual([e2]);
    expect(filterJournal([e1, e2], out, { result: "win" })).toEqual([e1]);
    expect(filterJournal([e1, e2], out, { text: "supply" })).toEqual([e2]);
    expect(filterJournal([e1, e2], out, { pair: "GBP_USD" })).toEqual([]);
  });
  it("static snapshot is labelled sample, shows outcome separately, avoids forecast words", () => {
    const t = entryText(e1, out[e1.id]);
    expect(t).toMatch(/SAMPLE DATA/);
    expect(t).toMatch(/Outcome \(recorded separately/);
    expect(entryText(e1)).toMatch(/Outcome: not recorded yet/);
    expect(t.replace(/Spekrym-FX Desk — decision record/, "")).not.toMatch(BAD);
  });
  it("parseTags dedupes, lowercases, strips #", () => { expect(parseTags("#London, london NY")).toEqual(["london", "ny"]); });
});

describe("stores", () => {
  beforeEach(() => { useJournalStore.getState().clearAll(); usePlanStore.getState().clear(); localStorage.clear(); });
  it("entries are immutable; duplicates rejected; outcome attaches without altering the entry", () => {
    const e = ok(base());
    const s = useJournalStore.getState();
    expect(s.add(e)).toBe(true);
    expect(useJournalStore.getState().add(e)).toBe(false);
    const stored = useJournalStore.getState().entries[0]!;
    expect(Object.isFrozen(stored)).toBe(true);
    expect(() => { (stored as { note: string }).note = "x"; }).toThrow();
    expect(useJournalStore.getState().setOutcome(e.id, { result: "loss", r: -1, followedPlan: null, note: "", set_at: T })).toBe(true);
    expect(useJournalStore.getState().entries[0]).toBe(stored);
    expect(useJournalStore.getState().setOutcome("nope", { result: "win", r: null, followedPlan: null, note: "", set_at: T })).toBe(false);
  });
  it("persists under spekrym.desk.journal.v1 / plans.v1; corrupt input is dropped", () => {
    useJournalStore.getState().add(ok(base()));
    usePlanStore.getState().save(base().plan);
    expect(JSON.parse(localStorage.getItem("spekrym.desk.journal.v1")!).data.entries).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("spekrym.desk.plans.v1")!).data).toHaveLength(1);
    expect(parseJournal({ entries: [{ bad: 1 }], outcomes: { x: { result: "win" } } })).toEqual({ entries: [], outcomes: {} });
    expect(parsePlans("junk")).toEqual([]);
  });
  it("one plan per pair+date (save replaces)", () => {
    const p = base().plan;
    usePlanStore.getState().save(p);
    usePlanStore.getState().save({ ...p, idea: "changed" });
    expect(usePlanStore.getState().plans).toHaveLength(1);
    expect(usePlanStore.getState().plans[0]!.idea).toBe("changed");
  });
});

describe("JournalBody", () => {
  beforeEach(() => { useJournalStore.getState().clearAll(); });
  it("empty state explains the fix; entry expands; outcome saves", async () => {
    render(<JournalBody />);
    expect(screen.getByText(/No decisions recorded yet/)).toBeTruthy();
    const e = ok(base());
    useJournalStore.getState().add(e);
    const u = userEvent.setup();
    render(<JournalBody />);
    await u.click((await screen.findAllByRole("button", { name: /Expand entry/ }))[0]!);
    await u.click(screen.getByRole("button", { name: "Save outcome" }));
    expect(useJournalStore.getState().outcomes[e.id]?.result).toBe("win");
    expect(screen.getByRole("button", { name: "Copy snapshot" })).toBeTruthy();
  });
});