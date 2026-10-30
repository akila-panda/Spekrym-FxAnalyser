import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { decisionsForDay, useDecisionStore } from "@/desk/decisions/decisionStore";
import { mkObj } from "@/desk/__fixtures__/objects";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import type { AnalysisObject } from "@/desk/types/schemas";
import { addCustom, cursorBy, goStep, markReviewed, saveSnapshot, stepBy, triage, undo } from "./actions";
import { buildChecklist } from "./checklist";
import { customObject } from "./customLevel";
import { emptyDraft, parseDrafts, usePrepareStore, type PrepareView } from "./prepareStore";
import { buildSnapshot, useSnapshotStore } from "./snapshotStore";
import { buildInbox, moveStep, STEPS, type InboxItem, type Step } from "./walk";

const AS_OF = 2_000_000_000;
const lvl = (tf: Step, sig: number, extra: Partial<AnalysisObject> = {}) =>
  mkObj({ type: "sr_level", layer: "levels", source_tf: tf, grade: { significance: sig, relevance: null, quality: null, freshness: null, factors: [] }, ...extra });

function mkView(objs: AnalysisObject[]): PrepareView {
  const inbox = {} as Record<Step, InboxItem[]>;
  const dec = decisionsForDay(useDecisionStore.getState().decisions, "EUR_USD", "2033-05-18");
  for (const s of STEPS) inbox[s] = buildInbox(objs, [], s, AS_OF, dec);
  return { pair: "EUR_USD", date: "2033-05-18", asOf: AS_OF, rulesVersion: "rtest", dataKind: "sample", inbox, checklist: buildChecklist(inbox, {}) };
}
const publish = (objs: AnalysisObject[]) => usePrepareStore.getState().setView(mkView(objs));
/** Re-derive the published view the way usePrepareSession does (after decisions/drafts change). */
const refresh = (objs: AnalysisObject[]) => {
  const key = "EUR_USD|2033-05-18";
  const d = usePrepareStore.getState().drafts[key] ?? emptyDraft();
  const customs = d.customs.map((c) => customObject(c, "rtest", "sample"));
  const dec = decisionsForDay(useDecisionStore.getState().decisions, "EUR_USD", "2033-05-18");
  const inbox = {} as Record<Step, InboxItem[]>;
  for (const s of STEPS) inbox[s] = buildInbox(objs, customs, s, AS_OF, dec);
  usePrepareStore.getState().setView({ ...mkView(objs), inbox, checklist: buildChecklist(inbox, d.reviewed) });
};

beforeEach(() => {
  localStorage.clear();
  useDecisionStore.setState({ decisions: [] });
  useSnapshotStore.setState({ snapshots: [] });
  usePrepareStore.setState({ drafts: {}, step: "D", cursor: 0, undo: [], view: null });
  useDeskUiStore.setState({ selectedObjectId: null });
});

describe("walk", () => {
  it("steps run W→M1 and clamp", () => {
    expect([...STEPS]).toEqual(["W", "D", "H4", "H1", "M15", "M5", "M1"]);
    expect(moveStep("W", -1)).toBe("W");
    expect(moveStep("M1", 1)).toBe("M1");
    expect(moveStep("D", 1)).toBe("H4");
  });

  it("inbox: native TF + level types only, as-of filtered, spent excluded, best first", () => {
    const a = lvl("D", 0.2); const b = lvl("D", 0.9);
    const other = lvl("H4", 0.5);
    const swing = mkObj({ type: "swing", layer: "structure", source_tf: "D" });
    const future = lvl("D", 0.99, { known_at: AS_OF + 1 });
    const spent = lvl("D", 0.7, { lifecycle: [{ kind: "broken", t: 1, known_at: 1 }] });
    const items = buildInbox([a, b, other, swing, future, spent], [], "D", AS_OF, new Map());
    expect(items.map((i) => i.object.id)).toEqual([b.id, a.id]);
  });

  it("inbox is capped but custom levels are always kept", () => {
    const many = Array.from({ length: 30 }, (_, i) => lvl("H1", i / 100));
    const c = customObject({ id: "reference_level:EUR_USD:H1:5-1", pair: "EUR_USD", tf: "H1", price: 1.1, label: "Mine", group: "Level", notes: "", known_at: 5, seq: 1 }, "r", "sample");
    const items = buildInbox(many, [c], "H1", AS_OF, new Map());
    expect(items.length).toBe(21);
    expect(items[20]!.custom).toBe(true);
  });
});

describe("checklist", () => {
  it("auto-ticks when fully triaged; empty steps never auto-tick; marks override both ways", () => {
    const o = lvl("D", 0.5);
    const inbox = Object.fromEntries(STEPS.map((s) => [s, [] as InboxItem[]])) as Record<Step, InboxItem[]>;
    inbox.D = [{ object: o, custom: false, triage: "accept" }];
    let c = buildChecklist(inbox, {});
    expect(c.find((x) => x.step === "D")!.done).toBe(true);
    expect(c.find((x) => x.step === "W")!.done).toBe(false);
    c = buildChecklist(inbox, { D: false, W: true });
    expect(c.find((x) => x.step === "D")!.done).toBe(false);
    expect(c.find((x) => x.step === "W")!.done).toBe(true);
  });
});

describe("actions", () => {
  it("Y records a decision with decided_at and advances; U undoes it", () => {
    const a = lvl("D", 0.9); const b = lvl("D", 0.5);
    publish([a, b]);
    triage("accept");
    const d = useDecisionStore.getState().decisions[0]!;
    expect(d.objectId).toBe(a.id);
    expect(d.action).toBe("accept");
    expect(d.decided_at).toBeGreaterThan(0);
    expect(d.rulesVersion).toBe("rtest");
    expect(usePrepareStore.getState().cursor).toBe(1);
    expect(useDeskUiStore.getState().selectedObjectId).toBe(b.id);
    undo();
    expect(useDecisionStore.getState().decisions).toHaveLength(0);
    expect(usePrepareStore.getState().cursor).toBe(0);
  });

  it("re-deciding replaces the decision and undo restores the previous one", () => {
    const a = lvl("D", 0.9);
    publish([a]);
    triage("accept");
    usePrepareStore.getState().setCursor(0);
    triage("reject");
    expect(useDecisionStore.getState().decisions).toHaveLength(1);
    expect(useDecisionStore.getState().decisions[0]!.action).toBe("reject");
    undo();
    expect(useDecisionStore.getState().decisions[0]!.action).toBe("accept");
  });

  it("step and cursor moves clamp", () => {
    publish([lvl("D", 0.9), lvl("D", 0.5)]);
    goStep("D"); cursorBy(5);
    expect(usePrepareStore.getState().cursor).toBe(1);
    cursorBy(-5);
    expect(usePrepareStore.getState().cursor).toBe(0);
    stepBy(-9);
    expect(usePrepareStore.getState().step).toBe("W");
  });

  it("custom level: validated, becomes a reference_level at as-of, records 'custom', undoable", () => {
    publish([]);
    expect(addCustom({ tf: "H1", price: 0, label: "x", group: "Level", notes: "" })).toBe(false);
    expect(addCustom({ tf: "H1", price: 1.12345, label: " Daily open ", group: "Target", notes: "n" })).toBe(true);
    const c = usePrepareStore.getState().drafts["EUR_USD|2033-05-18"]!.customs[0]!;
    expect(c.known_at).toBe(AS_OF);
    expect(c.price).toBe(1.12345);
    expect(c.label).toBe("Daily open");
    expect(useDecisionStore.getState().decisions[0]!.action).toBe("custom");
    expect(customObject(c, "r", "sample").type).toBe("reference_level");
    undo();
    expect(usePrepareStore.getState().drafts["EUR_USD|2033-05-18"]!.customs).toHaveLength(0);
    expect(useDecisionStore.getState().decisions).toHaveLength(0);
  });

  it("snapshot is immutable, stamps sample/rulesVersion/as-of, and excludes anything knowable after as-of", () => {
    const a = lvl("D", 0.9); const b = lvl("H4", 0.5); const late = lvl("H4", 0.4, { known_at: AS_OF + 60 });
    const all = [a, b, late];
    publish(all);
    triage("accept");                       // a (D)
    goStep("H4"); triage("reject");         // b (H4)
    markReviewed("W", true);
    refresh(all);
    usePrepareStore.getState().patchDraft("EUR_USD|2033-05-18", (d) => ({ ...d, notes: "  bias: range  " }));
    refresh(all);
    const id = saveSnapshot();
    expect(id).toBeTruthy();
    const s = useSnapshotStore.getState().snapshots[0]!;
    expect(s.acceptedIds).toEqual([a.id]);
    expect(s.rejectedIds).toEqual([b.id]);
    expect(s.objects.map((o) => o.id)).toEqual([a.id]);
    expect(s.objects.every((o) => o.known_at <= s.as_of)).toBe(true);
    expect(s.dataKind).toBe("sample");
    expect(s.rulesVersion).toBe("rtest");
    expect(s.notes).toBe("bias: range");
    expect(s.reviewedSteps).toContain("W");
    expect(Object.isFrozen(s)).toBe(true);
    expect(() => { (s as { notes?: string }).notes = "x"; }).toThrow();
    expect(useSnapshotStore.getState().add({ ...s })).toBe(false); // duplicate id
  });

  it("buildSnapshot drops a decided object whose known_at is after as_of", () => {
    const late = lvl("D", 0.9, { known_at: AS_OF + 1 });
    const dec = new Map([[late.id, { id: "x", pair: "EUR_USD", date: "2033-05-18", objectId: late.id, action: "accept" as const, decided_at: 1, rulesVersion: "r" }]]);
    const s = buildSnapshot({ pair: "EUR_USD", date: "2033-05-18", as_of: AS_OF, dataKind: "sample", rulesVersion: "r", objects: [late], decisions: dec, reviewedSteps: [], notes: "", created_at: 1 });
    expect(s.acceptedIds).toEqual([]);
    expect(s.objects).toEqual([]);
  });
});

describe("stores", () => {
  it("corrupt drafts/decisions are dropped, valid ones kept", () => {
    expect(parseDrafts("nope")).toEqual({});
    const d = parseDrafts({ k: { reviewed: { W: true, X: true }, customs: [{ bad: 1 }], notes: 5 } });
    expect(d.k).toEqual({ reviewed: { W: true }, customs: [], notes: "" });
  });

  it("decisions persist to spekrym.desk.decisions.v1", () => {
    useDecisionStore.getState().decide({ pair: "EUR_USD", date: "2033-05-18", objectId: "o1", action: "accept", rulesVersion: "r", decided_at: 5 });
    expect(JSON.parse(localStorage.getItem("spekrym.desk.decisions.v1")!).data).toHaveLength(1);
  });
});

describe("isolation", () => {
  it("prepare/decision code never imports sync/ or writes viewStore.asOf", () => {
    const files = [
      ...readdirSync(__dirname).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(".test.")).map((f) => join(__dirname, f)),
      join(__dirname, "../decisions/decisionStore.ts"),
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/@\/sync/);
      expect(src, f).not.toMatch(/setAsOf|viewStore\.[a-z]*\.?setState\([^)]*asOf/);
      expect(src, f).not.toMatch(/useViewStore\.(getState|setState)/);
    }
  });
});