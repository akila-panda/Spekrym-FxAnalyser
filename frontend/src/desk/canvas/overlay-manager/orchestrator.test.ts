import { describe, expect, it } from "vitest";
import type { ChartMapping } from "@/intel/contracts";
import { orchestrate, type OverlayItem } from "./orchestrator";

const mk = (id: string, source: string, geo: string, overlayType = "zone"): ChartMapping => ({
  mappingId: id, sourceModule: source, objectIds: [geo], overlayType, geometryRefs: [geo],
  visibility: "visible", evidenceIds: [],
});

describe("F3 orchestrator — dedup correlated into one primary + evidence stack", () => {
  it("four engines on one zone -> one group, four sources, three in the stack (not four confirmations)", () => {
    const items: OverlayItem[] = ["a", "b", "c", "d"].map((s) => ({ mapping: mk(`m:${s}`, s, "zoneA") }));
    const { groups } = orchestrate(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sources.sort()).toEqual(["a", "b", "c", "d"]);
    expect(groups[0]!.stack).toHaveLength(3);
  });
});

describe("F3 orchestrator — conflicts exposed, never averaged", () => {
  it("support + oppose on the same geometry produce a conflict listing both, with no merged score", () => {
    const items: OverlayItem[] = [
      { mapping: mk("m:s", "struct", "zoneA"), polarity: "support" },
      { mapping: mk("m:o", "regime", "zoneA"), polarity: "oppose" },
    ];
    const view = orchestrate(items);
    expect(view.conflicts).toHaveLength(1);
    expect(view.conflicts[0]!.supports).toEqual(["m:s"]);
    expect(view.conflicts[0]!.opposes).toEqual(["m:o"]);
    // no averaged score anywhere on the view
    expect(Object.keys(view)).toEqual(["groups", "collapsed", "conflicts"]);
  });
});

describe("F3 overlay manager — clutter budget", () => {
  it("collapses non-P0 groups beyond the budget, keeping the rest visible", () => {
    const items: OverlayItem[] = ["g1", "g2", "g3", "g4", "g5"].map((g) => ({ mapping: mk(`m:${g}`, "s", g) }));
    const { groups, collapsed } = orchestrate(items, { clutterBudget: 2 });
    expect(groups).toHaveLength(2);
    expect(collapsed).toHaveLength(3);
  });

  it("never hides a P0 item, even under Simplify (budget 0)", () => {
    const items: OverlayItem[] = [
      { mapping: mk("m:warn", "safety", "zW", "warning") },            // P0 by overlayType
      { mapping: mk("m:inval", "scenario", "zI"), priority: 0 },       // P0 invalidation (explicit)
      { mapping: mk("m:ev1", "s", "z1") },
      { mapping: mk("m:ev2", "s", "z2") },
    ];
    const { groups, collapsed } = orchestrate(items, { simplify: true });
    const visibleIds = groups.map((g) => g.primary.mappingId);
    expect(visibleIds).toContain("m:warn");
    expect(visibleIds).toContain("m:inval");
    expect(collapsed.map((g) => g.primary.mappingId).sort()).toEqual(["m:ev1", "m:ev2"]);
  });
});
