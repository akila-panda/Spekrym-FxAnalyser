import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mkObj } from "@/desk/__fixtures__/objects";
import { detectAll, marketClass } from "@/desk/detect";
import { runKernel } from "@/desk/kernel/kernel";
import { viewAsOf } from "@/desk/kernel/viewAsOf";
import { deepCandles } from "@/desk/mock/deepMock";
import { useDeskStore } from "@/desk/workspace/deskStore";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { DEFAULTS } from "@/desk/methodology/defaults";
import { defaultWidgets } from "@/desk/workspace/widgetRegistry";
import type { AnalysisObject } from "@/desk/types/schemas";
import { buildBrief, type Brief, type BriefInput } from "./buildBrief";
import { BriefBody } from "./BriefBody";

const ATR = 0.001;
const T0 = 1_735_689_600;
const input = (o: Partial<BriefInput> & Pick<BriefInput, "objects">): BriefInput => ({
  pair: "EUR_USD", asOf: T0 + 90 * 3600, dataKind: "sample", price: 1.1, atr: ATR, trends: { D: "trend_up", H4: "range" }, ...o,
});
const demand = (lo: number, hi: number, extra: Partial<AnalysisObject> = {}) =>
  mkObj({ source_tf: "H4", direction: "bull", lo, hi, known_at: T0 + 3600, ...extra });
const sweepAt = (lo: number, hi: number) => mkObj({ type: "sweep", layer: "liquidity", source_tf: "H1", lo, hi, known_at: T0 + 85 * 3600 });
const BAD = /\b(buy|sell|long|short|reversal|likely|probab\w*|will)\b/i;
const texts = (b: Brief) => [b.label, b.context.text, b.matters.text, b.confirm.text, b.invalidate.text, ...b.confirmations.map((c) => c.label)].join(" | ");

describe("buildBrief states", () => {
  it("insufficient evidence when there is no price/ATR", () => {
    const b = buildBrief(input({ objects: [], price: null, atr: null, trends: {} }));
    expect(b.state).toBe("insufficient");
    expect(b.label).toBe("Insufficient evidence");
  });
  it("no actionable setup when nothing active is near price", () => {
    const b = buildBrief(input({ objects: [demand(1.2, 1.201)] }));
    expect(b.state).toBe("none");
    expect(b.label).toBe("No actionable setup");
    expect(b.focusId).toBeNull();
  });
  it("waiting (far) → watching (near) → at the zone without confirmation stays watching", () => {
    expect(buildBrief(input({ objects: [demand(1.1015, 1.102)] })).state).toBe("waiting"); // 1.5 ATR
    expect(buildBrief(input({ objects: [demand(1.1006, 1.101)] })).state).toBe("watching"); // 0.6 ATR
    expect(buildBrief(input({ objects: [demand(1.0995, 1.1005)] })).state).toBe("watching"); // inside, nothing confirmed
  });
  it("ready to review: at the zone with a confirming fact known after it, nearby, recent", () => {
    const z = demand(1.0995, 1.1005);
    const b = buildBrief(input({ objects: [z, sweepAt(1.0994, 1.0996)] }));
    expect(b.state).toBe("ready");
    expect(b.confirmations.find((c) => c.id === "sweep")?.status).toBe("seen");
    expect(b.confirm.objectId).toBeDefined();
  });
  it("opposite-direction or stale confirmations do not count", () => {
    const z = demand(1.0995, 1.1005);
    const bearFvg = mkObj({ type: "fvg", layer: "fvg", source_tf: "M15", direction: "bear", lo: 1.0996, hi: 1.0998, known_at: T0 + 85 * 3600 });
    const staleSweep = { ...sweepAt(1.0994, 1.0996), known_at: T0 + 2 * 3600 };
    const b = buildBrief(input({ objects: [z, bearFvg, staleSweep] }));
    expect(b.state).toBe("watching");
    expect(b.confirmations.every((c) => c.status !== "seen")).toBe(true);
  });
  it("invalidated when every accepted object is invalidated", () => {
    const z = demand(1.0995, 1.1005, { lifecycle: [{ kind: "invalidated", t: T0 + 60 * 3600, known_at: T0 + 60 * 3600 }] });
    const b = buildBrief(input({ objects: [z, demand(1.1006, 1.101)], acceptedIds: new Set([z.id]) }));
    expect(b.state).toBe("invalidated");
    expect(b.invalidate.objectId).toBe(z.id);
  });
  it("thesis restricts focus to accepted objects", () => {
    const a = demand(1.0995, 1.1005);
    const other = demand(1.1006, 1.101);
    expect(buildBrief(input({ objects: [a, other], acceptedIds: new Set([other.id]) })).focusId).toBe(other.id);
  });
});

describe("buildBrief answers", () => {
  it("four answers link to objects; invalidation uses the distal edge in pips", () => {
    const z = demand(1.0995, 1.1005);
    const b = buildBrief(input({ objects: [z], price: 1.1008 }));
    expect(b.matters.objectId).toBe(z.id);
    expect(b.invalidate.objectId).toBe(z.id);
    expect(b.invalidate.text).toMatch(/closes below 1\.09950 \(13\.0 pips from price\)/);
    expect(b.context.text).toBe("D trend up · H4 range");
  });
  it("shows contradictions and confluence areas in the matters text", () => {
    const z = demand(1.0995, 1.1005, { source_tf: "H1" });
    const sup = mkObj({ source_tf: "D", direction: "bear", lo: 1.0996, hi: 1.1004, known_at: T0 + 1800 });
    expect(buildBrief(input({ objects: [z, sup] })).matters.text).toMatch(/contradicting overlapping object/);
  });
  it("neutral objects mark direction-dependent checks unavailable and define no invalidation level", () => {
    const pool = mkObj({ type: "liquidity_pool", layer: "liquidity", source_tf: "H1", lo: 1.0999, hi: 1.1001, known_at: T0 + 3600 });
    const b = buildBrief(input({ objects: [pool] }));
    expect(b.confirmations.filter((c) => c.status === "unavailable").map((c) => c.id)).toEqual(["break", "fvg"]);
    expect(b.invalidate.text).toMatch(/No invalidation level/);
  });
  it("never uses trade-direction or prediction language in any state", () => {
    const z = demand(1.0995, 1.1005);
    const all = [
      buildBrief(input({ objects: [], price: null, atr: null, trends: {} })), buildBrief(input({ objects: [demand(1.2, 1.201)] })),
      buildBrief(input({ objects: [z] })), buildBrief(input({ objects: [z, sweepAt(1.0994, 1.0996)] })),
      buildBrief(input({ objects: [{ ...z, lifecycle: [{ kind: "invalidated", t: T0 + 9, known_at: T0 + 9 }] }], acceptedIds: new Set([z.id]) })),
    ];
    for (const b of all) expect(texts(b)).not.toMatch(BAD);
  });
});

describe("no lookahead", () => {
  it("every linked object is known by as-of; brief over viewAsOf(full,t) equals brief over detect(prefix t)", () => {
    const tfs = ["D", "H4", "H1", "M15", "M5"] as const;
    const run = (asOf: number) => {
      const objects: AnalysisObject[] = [];
      const trends: BriefInput["trends"] = {};
      let price: number | null = null;
      let atr: number | null = null;
      for (const tf of tfs) {
        const c = deepCandles("EUR_USD", tf);
        const r = detectAll({ candles: c, pair: "EUR_USD", tf, asOf, dataKind: "sample", dataVersion: `${c.length}` });
        objects.push(...r.objects);
        if (r.lastClose !== null) trends[tf] = marketClass(runKernel(c, { pair: "EUR_USD", tf, asOf }, DEFAULTS), DEFAULTS);
        if (tf === "M5") price = r.price;
        if (tf === "H1") atr = r.atr;
      }
      return { objects, trends, price, atr };
    };
    const full = run(Infinity);
    const m5 = deepCandles("EUR_USD", "M5");
    for (const k of [0.5, 0.8, 0.97]) {
      const t = m5[Math.floor(m5.length * k)]!.time + 300;
      const a = run(t);
      const viaView = buildBrief({ pair: "EUR_USD", asOf: t, dataKind: "sample", objects: viewAsOf(full.objects, t), trends: a.trends, price: a.price, atr: a.atr });
      const viaPrefix = buildBrief({ pair: "EUR_USD", asOf: t, dataKind: "sample", objects: a.objects, trends: a.trends, price: a.price, atr: a.atr });
      expect(viaView.state).toBe(viaPrefix.state);
      expect(viaView.matters).toEqual(viaPrefix.matters);
      expect(viaView.invalidate).toEqual(viaPrefix.invalidate);
      expect(viaView.confirm.text).toBe(viaPrefix.confirm.text);
      expect(viaView.evidence.every((o) => o.known_at <= t)).toBe(true);
      expect(texts(viaView)).not.toMatch(BAD);
    }
  }, 120000);
});

describe("BriefBody", () => {
  beforeEach(() => {
    useDeskUiStore.setState({ selectedObjectId: null, evidenceOpen: false, asOf: "latest" });
    useDeskStore.setState({ complexity: "standard" });
  });
  it("is a standard-level Live default and renders state with a sample badge", async () => {
    expect(defaultWidgets("live", "minimal").map((w) => w.id)).toContain("brief");
    render(<BriefBody />);
    const status = await screen.findByRole("status", {}, { timeout: 8000 });
    expect(status.textContent).toMatch(/Waiting|Watching|Ready to review|Invalidated|No actionable setup|Insufficient evidence/);
    expect(status.textContent).toMatch(/sample/);
    expect(screen.getByRole("region", { name: "What would invalidate" })).toBeTruthy();
  }, 30000);
  it("minimal drops the confirm answer; advanced adds factors; evidence button selects the object", async () => {
    useDeskStore.setState({ complexity: "minimal" });
    const { unmount } = render(<BriefBody />);
    await screen.findByRole("status", {}, { timeout: 8000 });
    expect(screen.queryByRole("region", { name: "What would confirm" })).toBeNull();
    const btn = screen.queryAllByRole("button", { name: /Show evidence/ })[0];
    if (btn) { await userEvent.click(btn); expect(useDeskUiStore.getState().selectedObjectId).not.toBeNull(); }
    unmount();
    useDeskStore.setState({ complexity: "advanced" });
    render(<BriefBody />);
    await screen.findByRole("status", {}, { timeout: 8000 });
    expect(screen.getByText(/Factors \(heuristic\)/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "What would confirm" })).toBeTruthy();
  }, 30000);
});