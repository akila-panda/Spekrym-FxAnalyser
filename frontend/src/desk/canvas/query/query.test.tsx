import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_NOW as N } from "@/intel/fixtures";
import { composeCanvas } from "../pipeline";
import { buildEngineLayer } from "../integration/engineLayer";
import { INTEGRATION_ELIGIBILITY, INTEGRATION_INSIGHTS, INTEGRATION_TRADES } from "../integration/integrationFixtures";
import { SAMPLE_REGIME_SERIES } from "../context/regimeFixtures";
import { STUDIO_FORECASTS, STUDIO_SCENARIOS, STUDIO_STATES } from "../scenario/scenarioFixtures";
import { useCanvasStore } from "../canvasStore";
import { usePrepareStore } from "../prepare/prepareStore";
import { CanvasRoot } from "../CanvasRoot";
import { QUERY_INSIGHTS, QUERY_OBJECTS } from "./queryFixtures";
import { QueryBar } from "./QueryBar";
import { MAX_WINDOW_SEC, ruleTranslator, runQuery, sanitizeFilters, verifyOps, type QueryContext, type Translator } from "./query";

const ctxAt = (asOf: number): QueryContext => {
  const composed = composeCanvas({ objects: QUERY_OBJECTS, insights: QUERY_INSIGHTS, asOf });
  const items = buildEngineLayer({
    objects: QUERY_OBJECTS, insights: [...INTEGRATION_INSIGHTS, ...QUERY_INSIGHTS], regimes: SAMPLE_REGIME_SERIES, scenarios: STUDIO_SCENARIOS,
    scenarioStates: STUDIO_STATES, forecasts: STUDIO_FORECASTS, trades: INTEGRATION_TRADES, eligibility: INTEGRATION_ELIGIBILITY, instrument: "EUR_USD", asOf,
  });
  return { overlays: composed.overlays, items, objects: QUERY_OBJECTS, asOf };
};
const ctx = ctxAt(N);
const types = (r: ReturnType<typeof runQuery>) => r.overlays.map((o) => o.primary.objectIds[0]);

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  useCanvasStore.setState({ mode: "prepare", selectedSourceId: null, selectedInsightId: null });
  usePrepareStore.getState().reset();
});

describe("F19 visual query (pure)", () => {
  it("rule translator: synonyms, window, p0; unknown words are returned, not guessed", () => {
    expect(ruleTranslator("Show me liquidity sweeps in the LAST 2 hours, banana")).toEqual({
      filters: { objectTypes: ["liquidity_pool", "sweep"], lastSec: 7200 }, understood: ["last 2 h", "liquidity", "sweeps"], unmatched: ["banana"],
    });
    expect(ruleTranslator("p0 risk").filters).toEqual({ p0: true });
    expect(ruleTranslator("last hour").filters.lastSec).toBe(3600);
    expect(ruleTranslator("past 30 min zones").filters).toMatchObject({ lastSec: 1800, objectTypes: ["fvg", "range", "sd_zone"] });
  });

  it("query focuses the matching overlay and opens its evidence", () => {
    const r = runQuery("sweeps", ctx);
    expect(types(r)).toEqual(["sweep:EUR_USD:M15:1"]);
    expect(r.ops.filter((o) => o.op === "focus")).toEqual([{ op: "focus", key: r.overlays[0]!.key }]);
    const ev = r.ops.find((o) => o.op === "open_evidence")!;
    expect(ev).toMatchObject({ op: "open_evidence", objectIds: ["sweep:EUR_USD:M15:1"] });
    expect((ev as { evidenceIds: string[] }).evidenceIds.length).toBeGreaterThan(0);
    expect(r.query.focusTarget).toBe(r.overlays[0]!.key);
  });

  it("deterministic: same text + as-of → identical result; word order and case do not matter", () => {
    const a = runQuery("Liquidity sweeps last 2 hours", ctx);
    expect(runQuery("Liquidity sweeps last 2 hours", ctx)).toEqual(a);
    expect(runQuery("last 2 hours SWEEPS liquidity", ctx).ops).toEqual(a.ops);
    expect(runQuery("sweeps", ctxAt(N)).ops).toEqual(runQuery("sweeps", ctxAt(N)).ops);
  });

  it("time window: only overlays overlapping [asOf-window, asOf]; adds a time_range op", () => {
    expect(types(runQuery("zones last 30 min", ctx))).toEqual([]);
    expect(types(runQuery("zones last 2 hours", ctx))).toEqual(["fvg:EUR_USD:H1:1"]);
    expect(runQuery("sweeps last 2 hours", ctx).ops).toContainEqual({ op: "time_range", from: N - 7200, to: N });
  });

  it("engine terms select engine items; context-only items are listed, never put on the chart", () => {
    const r = runQuery("regime", ctx);
    expect(r.overlays).toEqual([]);
    expect(r.ops).toEqual([]);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i) => i.engine === "regime" && i.surface === "context")).toBe(true);
    const p0 = runQuery("p0 warnings", ctx);
    expect(p0.items.length).toBeGreaterThan(0);
    expect(p0.items.every((i) => i.p0)).toBe(true);
  });

  it("causal: nothing knowable only later is returned; earlier as-of shrinks the answer", () => {
    expect(types(runQuery("sweeps", ctx))).not.toContain("sweep:EUR_USD:M15:2");
    expect(types(runQuery("sweeps", ctxAt(N - 2_000)))).toEqual([]);
    expect(runQuery("sweeps", ctxAt(N - 1_000)).overlays).toHaveLength(1);
    expect(runQuery("regime", ctxAt(0)).items).toEqual([]);
  });

  it("an LLM-style translator can only SELECT verified objects: fabricated references/types are rejected and surfaced", () => {
    const liar: Translator = () => ({ filters: { objectTypes: ["unicorn", "sweep"], engines: ["oracle"], focusIds: ["made_up:1", "fvg:EUR_USD:H1:1"], lastSec: -5 }, understood: ["x"], unmatched: [] });
    const r = runQuery("anything", ctx, liar);
    expect(r.rejected).toEqual(expect.arrayContaining([
      "unknown object type: unicorn", "unknown engine: oracle", "invalid time window: -5", "unknown reference (not a verified object): made_up:1",
    ]));
    expect(r.overlays.every((o) => ctx.overlays.includes(o))).toBe(true);
    expect(r.ops.every((o) => o.op === "time_range" || ctx.overlays.some((v) => v.key === o.key))).toBe(true);
    const bad = verifyOps([{ op: "focus", key: "fabricated" }, { op: "time_range", from: N, to: N + 100 }, { op: "focus", key: ctx.overlays[0]!.key }], ctx);
    expect(bad.ok).toEqual([{ op: "focus", key: ctx.overlays[0]!.key }]);
    expect(bad.rejected).toEqual(["unknown overlay: fabricated", "time range outside the knowable window"]);
    expect(sanitizeFilters({ lastSec: MAX_WINDOW_SEC + 1 }, ctx).rejected).toHaveLength(1);
  });

  it("nothing understood → no ops; recognised but no match → says so", () => {
    const r = runQuery("banana smoothie", ctx);
    expect(r.ops).toEqual([]);
    expect(r.unmatched).toEqual(["banana", "smoothie"]);
    expect(runQuery("swings", ctx)).toMatchObject({ ops: [], overlays: [], items: [] });
  });
});

describe("F19 QueryBar / Canvas", () => {
  it("keyboard: type + Enter → focused overlays + evidence + sample; Clear resets", async () => {
    const user = userEvent.setup();
    const seen: string[][] = [];
    render(<QueryBar overlays={ctx.overlays} items={ctx.items} objects={QUERY_OBJECTS} asOf={N} onFocus={(k) => seen.push(k)} />);
    expect(document.querySelector(".dk-sample")).toHaveTextContent("sample");
    await user.type(screen.getByRole("textbox", { name: /Visual query/ }), "liquidity sweeps{Enter}");
    const out = within(screen.getByRole("status"));
    expect(out.getByText(/Read as: liquidity · sweeps/)).toBeInTheDocument();
    expect(out.getByRole("list", { name: "Focused overlays" })).toHaveTextContent(/◎ Focused: .*evidence: sr_level:EUR_USD:H1:1746810000/);
    expect(seen[seen.length - 1]).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Clear query" }));
    expect(seen[seen.length - 1]).toEqual([]);
    expect(screen.queryByRole("list", { name: "Focused overlays" })).toBeNull();
  });

  it("rejected/unknown input is visible text; engine items show glyph + name + context-only", async () => {
    const user = userEvent.setup();
    render(<QueryBar overlays={ctx.overlays} items={ctx.items} objects={QUERY_OBJECTS} asOf={N} />);
    await user.type(screen.getByRole("textbox"), "regime banana{Enter}");
    expect(screen.getByText(/Not understood \(ignored\): banana/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Matching engine items" })).getAllByText(/context only/).length).toBeGreaterThan(0);
  });

  it("Canvas: query never hides overlays (count unchanged) and P0/other surfaces stay", async () => {
    const user = userEvent.setup();
    render(<CanvasRoot />);
    const before = screen.getAllByRole("button", { pressed: false }).filter((b) => b.className.includes("vc-overlay")).length;
    await user.type(screen.getByRole("textbox", { name: /Visual query/ }), "levels{Enter}");
    const overlays = screen.getAllByRole("button").filter((b) => b.className.includes("vc-overlay"));
    expect(overlays).toHaveLength(before);
    expect(overlays[0]).toHaveTextContent(/◎ focused/);
    expect(screen.getByLabelText("Cross-engine layer")).toBeInTheDocument();
  });
});