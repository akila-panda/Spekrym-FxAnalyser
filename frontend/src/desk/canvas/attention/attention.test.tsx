import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_INSIGHTS, SAMPLE_NOW as N } from "@/intel/fixtures";
import { composeCanvas } from "../pipeline";
import { buildEngineLayer, type EngineItem } from "../integration/engineLayer";
import { INTEGRATION_ELIGIBILITY, INTEGRATION_INSIGHTS, INTEGRATION_TRADES } from "../integration/integrationFixtures";
import { SAMPLE_REGIME_SERIES } from "../context/regimeFixtures";
import { STUDIO_FORECASTS, STUDIO_SCENARIOS, STUDIO_STATES } from "../scenario/scenarioFixtures";
import { freezePlan } from "../prepare/plan";
import { overlayRef } from "../prepare/steps";
import { buildChangeFeed, sampleLiveFacts } from "../live/diff";
import { useCanvasStore } from "../canvasStore";
import { usePrepareStore } from "../prepare/prepareStore";
import { useTimelineStore } from "../timeline/timelineStore";
import { CanvasRoot } from "../CanvasRoot";
import { rankAttention, planItemIds, STALE_SEC } from "./attention";
import { compress, MATTERS_MAX } from "./compression";
import { parseAttention, useAttentionStore } from "./attentionStore";
import { AttentionPanel } from "./AttentionPanel";

const layer = (asOf = N): EngineItem[] => buildEngineLayer({
  objects: SAMPLE_ENGINE_OBJECTS, insights: INTEGRATION_INSIGHTS, regimes: SAMPLE_REGIME_SERIES, scenarios: STUDIO_SCENARIOS,
  scenarioStates: STUDIO_STATES, forecasts: STUDIO_FORECASTS, trades: INTEGRATION_TRADES, eligibility: INTEGRATION_ELIGIBILITY, instrument: "EUR_USD", asOf,
});
const overlays = composeCanvas({ objects: SAMPLE_ENGINE_OBJECTS, insights: SAMPLE_INSIGHTS, asOf: N }).overlays;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  try { localStorage.clear(); } catch { /* ignore */ }
  useAttentionStore.getState().reset();
  useTimelineStore.getState().reset();
  useCanvasStore.setState({ mode: "prepare", selectedSourceId: null, selectedInsightId: null });
  usePrepareStore.getState().reset();
});

describe("F20 attention (pure)", () => {
  it("P0 first; tiers ordered; deterministic", () => {
    const a = rankAttention(layer(), { asOf: N });
    const b = rankAttention([...layer()].reverse(), { asOf: N });
    expect(a.entries.map((e) => e.item.id)).toEqual(b.entries.map((e) => e.item.id));
    const tiers = a.entries.map((e) => e.tier);
    expect(tiers).toEqual([...tiers].sort());
    expect(a.entries.some((e) => e.tier === "P0")).toBe(true);
    expect(a.entries[0]!.tier).toBe("P0");
    expect(a.entries.map((e) => e.rank)).toEqual(a.entries.map((_, i) => i + 1));
  });

  it("causal: nothing ranked before it was knowable", () => {
    const items = layer();
    const early = items.reduce((m, i) => Math.min(m, i.availableAt), Infinity) - 1;
    expect(rankAttention(items, { asOf: early }).entries).toEqual([]);
    for (const e of rankAttention(items, { asOf: N - 1_000 }).entries) expect(e.item.availableAt).toBeLessThanOrEqual(N - 1_000);
  });

  it("user override: pin raises above its tier peers; mute lowers but still lists; P0 cannot be muted", () => {
    const base = rankAttention(layer(), { asOf: N });
    const p2 = base.entries.filter((e) => e.tier === "P2");
    expect(p2.length).toBeGreaterThan(1);
    const last = p2[p2.length - 1]!.item.id;
    const pin = rankAttention(layer(), { asOf: N, overrides: { pinned: [last], muted: [] } });
    const nonP0 = pin.entries.filter((e) => e.tier !== "P0");
    expect(nonP0[0]!.item.id).toBe(last);
    expect(nonP0[0]!.pinned).toBe(true);
    expect(pin.entries[0]!.tier).toBe("P0");

    const first = base.entries.find((e) => e.tier === "P1")!.item.id;
    const mute = rankAttention(layer(), { asOf: N, overrides: { pinned: [], muted: [first] } });
    expect(mute.entries).toHaveLength(base.entries.length);
    expect(mute.entries[mute.entries.length - 1]!.item.id).toBe(first);
    expect(mute.entries[mute.entries.length - 1]!.muted).toBe(true);

    const p0 = base.entries.find((e) => e.tier === "P0")!.item.id;
    const bad = rankAttention(layer(), { asOf: N, overrides: { pinned: [], muted: [p0, "ghost"] } });
    expect(bad.entries.find((e) => e.item.id === p0)!.muted).toBe(false);
    expect(bad.entries[0]!.tier).toBe("P0");
    expect(bad.ignored).toEqual([`cannot mute P0: ${p0}`]);
  });

  it("frozen plan membership promotes to P1; old unplanned items drop to P3", () => {
    const o = overlays[0]!;
    const plan = freezePlan({ pair: "EUR_USD", asOf: N, reviewedSteps: [], selectedIds: [overlayRef(o)] });
    const ids = planItemIds(plan, overlays);
    expect(o.primary.objectIds.every((id) => ids.has(id))).toBe(true);
    const r = rankAttention(layer(), { asOf: N, plan, overlays });
    for (const id of o.primary.objectIds) {
      const e = r.entries.find((x) => x.item.id === id);
      if (e && e.tier !== "P0") expect(e.tier).toBe("P1");
    }
    const old: EngineItem = { id: "old", engine: "observed", evidenceType: "observed_fact", label: "old", t: N - STALE_SEC - 10, availableAt: N - STALE_SEC - 10, surface: "chart", p0: false, discretionary: false };
    expect(rankAttention([old], { asOf: N }).entries[0]!.tier).toBe("P3");
  });
});

describe("F20 decision compression (pure)", () => {
  it("always yields the three answers; P0 never trimmed; budget applies to the rest", () => {
    const r = rankAttention(layer(), { asOf: N });
    const c = compress(r.entries, { asOf: N });
    expect(c.matters.length).toBeGreaterThan(0);
    expect(c.watchNext.length).toBeGreaterThan(0);
    expect(c.changes.length).toBeGreaterThan(0);
    const p0 = r.entries.filter((e) => e.tier === "P0").map((e) => e.item.id);
    for (const id of p0) expect(c.matters.map((l) => l.id)).toContain(id);
    expect(c.matters.filter((l) => l.tier !== "P0").length).toBeLessThanOrEqual(MATTERS_MAX);
    const empty = compress([], { asOf: N });
    expect([empty.matters[0]!.id, empty.watchNext[0]!.id, empty.changes[0]!.id]).toEqual(["none", "none", "none"]);
  });

  it("correctness: matters/watch/changes are drawn only from ranked entries + feed; muted excluded but P0 kept", () => {
    const r = rankAttention(layer(), { asOf: N });
    const ids = new Set(r.entries.map((e) => e.item.id));
    const c = compress(r.entries, { asOf: N });
    for (const l of [...c.matters, ...c.watchNext]) expect(ids.has(l.id)).toBe(true);
    const scen = r.entries.find((e) => e.item.evidenceType === "conditional_scenario" && e.tier !== "P0")!;
    expect(c.watchNext.map((l) => l.id)).toContain(scen.item.id);
    const m = rankAttention(layer(), { asOf: N, overrides: { pinned: [], muted: [scen.item.id] } });
    expect(compress(m.entries, { asOf: N }).watchNext.map((l) => l.id)).not.toContain(scen.item.id);
  });

  it("changes: classified live facts are causal and an invalidation surfaces the thesis as P0", () => {
    const plan = freezePlan({ pair: "EUR_USD", asOf: N, reviewedSteps: [], selectedIds: ["x"] });
    const facts = [...sampleLiveFacts(plan), { id: "inv", t: N + 1_500, kind: "invalidation" as const, targetId: "x" }];
    const feed = buildChangeFeed(plan, facts);
    const r = rankAttention(layer(), { asOf: N });
    const before = compress(r.entries, { asOf: N, feed, feedAsOf: N });
    expect(before.thesisIntact).toBe(true);
    expect(before.changes.some((l) => l.id.startsWith("chg:"))).toBe(false);
    const live = compress(r.entries, { asOf: N, feed, feedAsOf: Infinity });
    expect(live.thesisIntact).toBe(false);
    expect(live.matters[0]).toMatchObject({ id: "thesis", tier: "P0" });
    expect(live.changes.some((l) => l.text.includes("INVALIDATED"))).toBe(true);
  });
});

describe("F20 attention store", () => {
  it("parse drops junk and conflicts; pin/mute are exclusive; persists locally", () => {
    expect(parseAttention({ pinned: ["a", 1, "a"], muted: ["a", "b"] })).toEqual({ pinned: ["a"], muted: ["b"] });
    expect(parseAttention(null)).toEqual({ pinned: [], muted: [] });
    const s = useAttentionStore.getState();
    s.togglePin("a"); s.toggleMute("a");
    expect(useAttentionStore.getState()).toMatchObject({ pinned: [], muted: ["a"] });
    expect(localStorage.getItem("spekrym.desk.attention.v1")).toContain("\"muted\":[\"a\"]");
  });
});

describe("F20 panel + Canvas", () => {
  it("override via keyboard changes order; P0 mute disabled; reset restores", async () => {
    const user = userEvent.setup();
    const items = layer();
    render(<AttentionPanel items={items} overlays={overlays} plan={null} asOf={N} />);
    const region = screen.getByRole("region", { name: "Attention and decision summary" });
    expect(within(region).getByRole("region", { name: "What matters" })).toBeInTheDocument();
    expect(within(region).getByRole("region", { name: "Watch next" })).toBeInTheDocument();
    expect(within(region).getByRole("region", { name: "What changes" })).toBeInTheDocument();
    const list = within(region).getByRole("list", { name: "Ranked attention" });
    const rows = () => within(list).getAllByRole("listitem");
    const p0row = rows().find((r) => r.getAttribute("data-tier") === "P0")!;
    expect(within(p0row).getByRole("button", { name: /^Mute / })).toBeDisabled();
    const before = rows().map((r) => r.textContent);
    const target = rows().filter((r) => r.getAttribute("data-tier") === "P2").pop()!;
    const pin = within(target).getByRole("button", { name: /^Pin / });
    pin.focus(); await user.keyboard("{Enter}");
    expect(rows().map((r) => r.textContent)).not.toEqual(before);
    expect(within(list).getAllByRole("listitem")).toHaveLength(before.length);
    expect(within(list).getAllByRole("button", { pressed: true }).length).toBe(1);
    await user.click(within(region).getByRole("button", { name: "Reset attention overrides" }));
    expect(rows().map((r) => r.textContent)).toEqual(before);
  });

  it("Canvas mounts it in every mode with the 'sample' cue", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    for (const m of ["Prepare", "Explore", "Monitor", "Review"]) {
      await user.click(screen.getByRole("button", { name: m }));
      const r = screen.getByRole("region", { name: "Attention and decision summary" });
      expect(within(r).getByText("sample")).toBeInTheDocument();
      expect(within(r).getByRole("region", { name: "What matters" })).toBeInTheDocument();
    }
  });
});