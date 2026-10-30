import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildSnapshot } from "@/desk/prepare/snapshotStore";
import { SnapshotSchema, type AnalysisObject, type Decision, type Snapshot } from "@/desk/types/schemas";
import { ExportView } from "./ExportPanel";
import { buildPine, PINE_COLORS, pineStr } from "./pine";
import { PINE_LIMITS } from "./pineLimits";
import { toPlainList } from "./plainList";

const T = 1_735_689_600;
const AS_OF = T + 100_000;

function mk(id: string, type: AnalysisObject["type"], over: Partial<AnalysisObject> = {}): AnalysisObject {
  return {
    id, type, layer: "levels", pair: "EUR_USD", source_tf: "D", direction: "bull",
    geometry: { bands: [{ pHigh: 1.0862, pLow: 1.085 }], anchorTimes: [T] },
    t_event: T, known_at: T + 10, confirmed_at: null, lifecycle: [], evidence: [],
    provenance: { rulesVersion: "rtest", dataKind: "sample", detector: "t", detectorVersion: 1 },
    ...over,
  } as AnalysisObject;
}
const snapOf = (objects: AnalysisObject[], extra: Partial<Snapshot> = {}): Snapshot =>
  SnapshotSchema.parse({
    id: "snap:EUR_USD:2025-01-02:abc", pair: "EUR_USD", date: "2025-01-02", as_of: AS_OF, dataKind: "sample",
    rulesVersion: "rtest", acceptedIds: objects.map((o) => o.id), objects, created_at: AS_OF, ...extra,
  });

describe("buildPine", () => {
  const objs = [
    mk("sr1", "sr_level", { grade: { significance: 0.9, relevance: null, quality: null, freshness: null, factors: [] } }),
    mk("ref1", "reference_level", { geometry: { bands: [{ pHigh: 1.09, pLow: 1.09 }], anchorTimes: [T] } }),
    mk("fvg1", "fvg", { direction: "bear" }),
    mk("tl1", "trendline", { geometry: { bands: [], anchorTimes: [T], points: [{ t: T, p: 1.08 }, { t: T + 7200, p: 1.085 }] } }),
  ];

  it("emits v6 header, limits, sample stamp, manifest comments; draws once on the last bar", () => {
    const { code, manifest } = buildPine(snapOf(objs));
    expect(code.startsWith("//@version=6\n")).toBe(true);
    expect(code).toContain("max_lines_count=500, max_boxes_count=500, max_labels_count=500, max_polylines_count=100");
    expect(code).toContain("[SAMPLE]");
    expect(code).toContain("// snapshot: snap:EUR_USD:2025-01-02:abc");
    expect(code).toContain("rulesVersion: rtest");
    expect(code).toContain("if barstate.islast");
    expect(manifest.dataKind).toBe("sample");
    expect(manifest.fxRoll).toMatch(/FX roll/);
  });

  it("maps types to box / line / trend line and meters them", () => {
    const { code, meter, manifest } = buildPine(snapOf(objs));
    expect(code.match(/box\.new\(/g)).toHaveLength(2); // sr band + fvg
    expect(code.match(/line\.new\(/g)).toHaveLength(2); // reference + trendline
    expect(code).toContain("line.style_dashed");
    expect(meter).toEqual({ lines: 2, boxes: 2, labels: 4, polylines: 0, plots: 0 });
    expect(manifest.exported).toBe(4);
  });

  it("is deterministic", () => {
    expect(buildPine(snapOf(objs)).code).toBe(buildPine(snapOf(objs)).code);
  });

  it("skips spent objects and trendlines without two points, and reports both", () => {
    const spent = mk("sr2", "sr_level", { lifecycle: [{ kind: "broken", t: T + 50, known_at: T + 60 }] });
    const bad = mk("tl2", "trendline", { geometry: { bands: [], anchorTimes: [T] } });
    const { manifest, code } = buildPine(snapOf([objs[0]!, spent, bad]));
    expect(manifest.skipped).toEqual({ spent: 1, unsupported: 1, overLimit: 0 });
    expect(manifest.exported).toBe(1);
    expect(code.match(/box\.new\(/g)).toHaveLength(1);
  });

  it("drops lowest significance first when over limits and reports it; plain list keeps everything", () => {
    const many = Array.from({ length: 520 }, (_, i) =>
      mk(`sr:${i}`, "sr_level", { grade: { significance: i / 1000, relevance: null, quality: null, freshness: null, factors: [] } }));
    const snap = snapOf(many);
    const { meter, manifest, code, plain } = buildPine(snap);
    expect(meter.boxes).toBeLessThanOrEqual(PINE_LIMITS.boxes);
    expect(meter.labels).toBeLessThanOrEqual(PINE_LIMITS.labels);
    expect(manifest.skipped.overLimit).toBe(20);
    expect(manifest.exported).toBe(500);
    expect(code).toContain("over TradingView limits 20");
    expect(plain.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(520);
  });

  it("escapes strings and cannot be broken out of by notes or labels", () => {
    expect(pineStr('a"b\\c\nd')).toBe('"a\\"b\\\\c d"');
    const evil = mk("ref2", "reference_level", {
      geometry: { bands: [{ pHigh: 1.09, pLow: 1.09 }], anchorTimes: [T] },
      grade: { significance: null, relevance: null, quality: null, freshness: null, factors: [{ id: "label", label: 'x") \nindicator("evil', status: "supports" }] },
    });
    const { code } = buildPine(snapOf([evil], { notes: 'n1\nindicator("evil2")\r\nplot(1)' }));
    for (const line of code.split("\n")) {
      expect(/^\s*(indicator\("evil|plot\()/.test(line)).toBe(false);
      expect(line.includes("\r")).toBe(false);
    }
  });

  it("uses only existing role-token colours", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8").toLowerCase();
    for (const hex of Object.values(PINE_COLORS)) expect(css).toContain(hex);
    const used = buildPine(snapOf(objs)).code.match(/#[0-9a-f]{6}/gi) ?? [];
    for (const h of used) expect(Object.values(PINE_COLORS)).toContain(h.toLowerCase());
  });

  it("never exports an object knowable after as-of (same viewAsOf path as the snapshot)", () => {
    const late = mk("late", "sr_level", { known_at: AS_OF + 1, geometry: { bands: [{ pHigh: 1.2345, pLow: 1.2335 }], anchorTimes: [T] } });
    const ok = mk("ok", "sr_level");
    const decisions = new Map<string, Decision>(
      [late, ok].map((o) => [o.id, { id: o.id, pair: "EUR_USD", date: "2025-01-02", objectId: o.id, action: "accept", decided_at: AS_OF, rulesVersion: "rtest" } as Decision]),
    );
    const snap = buildSnapshot({ pair: "EUR_USD", date: "2025-01-02", as_of: AS_OF, dataKind: "sample", rulesVersion: "rtest", objects: [late, ok], decisions, reviewedSteps: [], notes: "", created_at: AS_OF });
    const { code, plain } = buildPine(snap);
    expect(code).not.toContain("1.23450");
    expect(plain).not.toContain("1.2345");
    // direct defence: even a hand-built snapshot containing a late object does not export it
    expect(buildPine(snapOf([late, ok])).manifest.exported).toBe(1);
  });

  it("plain list carries the sample stamp, snapshot id and rules", () => {
    const p = toPlainList(snapOf(objs));
    expect(p).toContain("[SAMPLE]");
    expect(p).toContain("snap:EUR_USD:2025-01-02:abc");
    expect(p).toContain("rtest");
  });
});

describe("ExportView", () => {
  it("prompts to save a snapshot when none exist", () => {
    render(<ExportView snapshots={[]} />);
    expect(screen.getByText(/Save a snapshot/)).toBeInTheDocument();
  });

  it("shows meter + sample badge, copies Pine and plain list, warns when over limits", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const many = Array.from({ length: 510 }, (_, i) => mk(`sr:${i}`, "sr_level"));
    render(<ExportView snapshots={[snapOf(many)]} />);
    expect(screen.getByRole("list", { name: "TradingView limits" })).toHaveTextContent("boxes 500/500");
    expect(screen.getByRole("alert")).toHaveTextContent("10 items left out");
    await user.click(screen.getByRole("button", { name: "Copy Pine" }));
    expect(writeText.mock.calls[0]![0]).toMatch(/^\/\/@version=6/);
    expect(screen.getByRole("status")).toHaveTextContent("Pine script copied.");
    await user.click(screen.getByRole("button", { name: "Copy plain list" }));
    expect(writeText.mock.calls[1]![0]).toContain("[SAMPLE]");
    expect(screen.getByRole("button", { name: "Download .pine" })).toBeInTheDocument();
  });
});