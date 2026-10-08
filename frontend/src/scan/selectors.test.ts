import { rejectedSetup, scanOf, validSetup } from "@/test/scanFixtures";
import type { Timeframe } from "@/types/market";
import {
  DEFAULT_FILTERS, MIN_SETUPS, allSummaries, filterSetups, formatPct, formatR, neighbor, rowsFor, sortRows,
  stepNeighbor, tabCounts, tfSummary, type PanelsLike,
} from "./selectors";

const empty = () => ({ status: "idle", stale: false });
const panels = (over: Partial<Record<Timeframe, ReturnType<typeof scanOf>>>): PanelsLike => {
  const p = { M1: empty(), M5: empty(), M15: empty(), H1: empty(), H4: empty() } as PanelsLike;
  for (const [tf, result] of Object.entries(over)) p[tf as Timeframe] = { status: "done", stale: false, result };
  return p;
};

const m5 = scanOf("M5", [
  validSetup("a", 0, 2.1, "long"), validSetup("b", 2, -1, "short"), validSetup("c", 1, 0, "long"), rejectedSetup("r", 4),
]);
const m1 = scanOf("M1", [validSetup("a", 1, 0.5, "short")], 0.5); // same id "a" as M5: keys must not collide
const P = panels({ M5: m5, M1: m1 });

describe("filters", () => {
  const rows = rowsFor(P, "M5", { ...DEFAULT_FILTERS, showRejected: true });
  it("hides rejected by default and shows them on request", () => {
    expect(rowsFor(P, "M5", DEFAULT_FILTERS).map((r) => r.setup.id)).toEqual(["a", "c", "b"]);
    expect(rows.map((r) => r.setup.id)).toEqual(["a", "c", "b", "r"]);
  });
  it("filters by direction, outcome and date", () => {
    expect(filterSetups(rows, { ...DEFAULT_FILTERS, direction: "short" }).map((r) => r.setup.id)).toEqual(["b"]);
    expect(filterSetups(rows, { ...DEFAULT_FILTERS, showRejected: true, outcome: "win" }).map((r) => r.setup.id)).toEqual(["a"]);
    const day = (id: string) => rows.find((r) => r.setup.id === id)!.setup.date;
    expect(filterSetups(rows, { ...DEFAULT_FILTERS, showRejected: true, from: day("c"), to: day("b") }).map((r) => r.setup.id)).toEqual(["c", "b"]);
  });
  it("outcome filters drop rejected candidates", () => {
    expect(filterSetups(rows, { ...DEFAULT_FILTERS, showRejected: true, outcome: "loss" }).map((r) => r.setup.id)).toEqual(["b"]);
  });
});

describe("sort", () => {
  const rows = rowsFor(P, "M5", { ...DEFAULT_FILTERS, showRejected: true });
  it("sorts by date both ways", () => {
    expect(sortRows(rows, "date_asc").map((r) => r.setup.id)).toEqual(["a", "c", "b", "r"]);
    expect(sortRows(rows, "date_desc").map((r) => r.setup.id)).toEqual(["r", "b", "c", "a"]);
  });
  it("sorts by R with rejected last in both directions", () => {
    expect(sortRows(rows, "r_desc").map((r) => r.setup.id)).toEqual(["a", "c", "b", "r"]);
    expect(sortRows(rows, "r_asc").map((r) => r.setup.id)).toEqual(["b", "c", "a", "r"]);
  });
});

describe("merged All list and counts", () => {
  it("merges timeframes in date order, ties top-down, each row keeping its timeframe", () => {
    const all = rowsFor(P, "all", DEFAULT_FILTERS);
    expect(all.map((r) => `${r.tf}:${r.setup.id}`)).toEqual(["M5:a", "M5:c", "M1:a", "M5:b"]);
    expect(new Set(all.map((r) => r.key)).size).toBe(all.length);
  });
  it("counts what each tab lists", () => {
    expect(tabCounts(P, DEFAULT_FILTERS)).toEqual({ H4: 0, H1: 0, M15: 0, M5: 3, M1: 1, all: 4 });
    expect(tabCounts(P, { ...DEFAULT_FILTERS, showRejected: true }).M5).toBe(4);
  });
});

describe("summary", () => {
  it("is per timeframe and never combined", () => {
    const a = allSummaries(P);
    expect(a.map((s) => s.tf)).toEqual(["M5", "M1"]);
    expect(tfSummary(P, "M5")).toMatchObject({ n_valid: 3, n_rejected: 1, expectancy_r: 0.42, tooFew: true });
    expect(tfSummary(P, "M1")).toMatchObject({ n_valid: 1, expectancy_r: 0.5 });
    expect(tfSummary(P, "H4")).toBeNull();
    expect(Object.keys(a[0]!)).not.toContain("total");
    expect(MIN_SETUPS).toBe(30);
  });
  it("is not 'too few' at 30 valid setups", () => {
    const many = scanOf("M5", Array.from({ length: 30 }, (_, i) => validSetup(`s${i}`, i, 1)));
    expect(tfSummary(panels({ M5: many }), "M5")?.tooFew).toBe(false);
  });
});

describe("navigation helpers", () => {
  const rows = rowsFor(P, "all", DEFAULT_FILTERS);
  it("moves through rows and clamps at the ends", () => {
    expect(neighbor(rows, null, 1)?.key).toBe(rows[0]!.key);
    expect(neighbor(rows, null, -1)?.key).toBe(rows[rows.length - 1]!.key);
    expect(neighbor(rows, rows[0]!.key, 1)?.key).toBe(rows[1]!.key);
    expect(neighbor(rows, rows[0]!.key, -1)).toBeNull();
    expect(neighbor(rows, rows[rows.length - 1]!.key, 1)).toBeNull();
    expect(neighbor([], null, 1)).toBeNull();
    expect(neighbor(rows, "gone", 1)?.key).toBe(rows[0]!.key);
  });
  it("cycles steps through all, 1..n", () => {
    const steps = [1, 2, 3].map((n) => ({ n, label: `s${n}`, known_at: n }));
    expect(stepNeighbor(steps, null, 1)).toBe(1);
    expect(stepNeighbor(steps, 1, 1)).toBe(2);
    expect(stepNeighbor(steps, 3, 1)).toBeNull();
    expect(stepNeighbor(steps, null, -1)).toBe(3);
    expect(stepNeighbor(steps, 1, -1)).toBeNull();
    expect(stepNeighbor([], null, 1)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats R with a real minus sign and win rate as a percent", () => {
    expect(formatR(2.1)).toBe("+2.10R");
    expect(formatR(-1)).toBe("−1.00R");
    expect(formatR(0)).toBe("0.00R");
    expect(formatPct(0.474)).toBe("47%");
  });
});