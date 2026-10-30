import { rejectedSetup, validSetup } from "@/test/scanFixtures";
import type { Setup } from "@/types";
import { firstFailed, matchesFailedCondition, rejectionCounts } from "./rejections";
import { DEFAULT_FILTERS, filterSetups, rowKey, type SetupRow } from "./selectors";

const c = (key: string, passed: boolean | null) => ({ key, label: key.toUpperCase(), passed, detail: "" });
const rej = (id: string, days: number, conditions: Setup["conditions"]): Setup => ({ ...rejectedSetup(id, days), conditions });
const rows = (setups: Setup[]): SetupRow[] => setups.map((s) => ({ key: rowKey("M5", s.id), tf: "M5" as const, setup: s }));

describe("DX8 rejections", () => {
  const setups = [
    rej("r1", 1, [c("a", true), c("x", false), c("y", false)]),
    rej("r2", 2, [c("x", false)]),
    rej("r3", 3, [c("a", null), c("y", false)]),
    rej("r4", 4, [c("a", true)]),
    validSetup("v1", 5, 1),
  ];

  it("counts only the first failed condition of rejected setups", () => {
    expect(rejectionCounts(setups)).toEqual([
      { key: "x", label: "X", count: 2 },
      { key: "y", label: "Y", count: 1 },
    ]);
    expect(firstFailed(setups[0]!)?.key).toBe("x");
  });

  it("breaks ties by key and ignores rejections with no failed condition", () => {
    const tie = [rej("a", 1, [c("b", false)]), rej("b", 2, [c("a", false)]), rej("c", 3, [c("z", true)])];
    expect(rejectionCounts(tie).map((r) => r.key)).toEqual(["a", "b"]);
  });

  it("is empty without rejected candidates", () => {
    expect(rejectionCounts([validSetup("v", 1, 1)])).toEqual([]);
    expect(rejectionCounts([])).toEqual([]);
  });

  it("matches only rejected setups by first failed key", () => {
    expect(matchesFailedCondition(setups[0]!, "x")).toBe(true);
    expect(matchesFailedCondition(setups[0]!, "y")).toBe(false);
    expect(matchesFailedCondition(setups[4]!, "x")).toBe(false);
  });

  it("the filter lists exactly those rejections and composes with other filters", () => {
    const f = { ...DEFAULT_FILTERS, showRejected: true, failedCondition: "x" };
    expect(filterSetups(rows(setups), f).map((r) => r.setup.id)).toEqual(["r1", "r2"]);
    const later = { ...f, from: setups[1]!.date };
    expect(filterSetups(rows(setups), later).map((r) => r.setup.id)).toEqual(["r2"]);
  });

  it("is off by default", () => {
    expect(DEFAULT_FILTERS.failedCondition).toBe("");
    expect(filterSetups(rows(setups), { ...DEFAULT_FILTERS, showRejected: true })).toHaveLength(5);
  });
});