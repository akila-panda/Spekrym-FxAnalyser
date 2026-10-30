import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_NOW as N } from "@/intel/fixtures";
import { PortfolioCommandSnapshotSchema, LIFECYCLE_STAGES } from "@/intel/portfolioContracts";
import { SAMPLE_PORTFOLIO_COMMAND as SNAP } from "@/intel/portfolioFixtures";
import { createMockIntelligenceSource } from "@/intel/mockSource";
import { parseRole } from "@/window/role";
import { activeVetoes, drillDecisions, viewPortfolio } from "./portfolio";
import { PortfolioRoot } from "./PortfolioRoot";

beforeEach(() => { window.history.replaceState(null, "", "/?window=portfolio"); });
const cell = (v: ReturnType<typeof viewPortfolio>, s: string, i: string) => v.matrix.rows.find((r) => r.strategy === s)!.cells.find((c) => c.instrument === i)!;

describe("F17 portfolio view (pure)", () => {
  it("fixture conforms; role parses; mock source is sample", async () => {
    expect(() => PortfolioCommandSnapshotSchema.parse(SNAP)).not.toThrow();
    expect(parseRole("?window=portfolio")).toEqual({ kind: "portfolio" });
    expect((await createMockIntelligenceSource().getPortfolioCommand()).provenance.kind).toBe("sample");
    expect((await createMockIntelligenceSource({ missing: true }).getPortfolioCommand()).data.exposures).toEqual([]);
  });

  it("combined exposure: latest snapshot, caps banded, gross risk from open positions", () => {
    const v = viewPortfolio(SNAP, N);
    expect(v.exposure!.asOf).toBe(N - 1_000);
    expect(v.currencies.map((c) => [c.ccy, c.value, c.band])).toEqual([["USD", -1.7, "near"], ["EUR", 1, "ok"], ["GBP", 0.7, "ok"]]);
    expect(v.grossRiskPct).toBeCloseTo(1.7);
    expect(v.drawdown).toEqual({ value: 3.2, band: "ok" });
    expect(v.marginal.map((m) => m.strategy)).toEqual(["orb_v2", "ob_reclaim"]);
    expect(v.marginal[0]!.share).toBeCloseTo(0.6);
  });

  it("eligibility: a veto overrides eligible; an exploratory tier can never be eligible", () => {
    const v = viewPortfolio(SNAP, N);
    expect(cell(v, "orb_v2", "GBP_USD").state).toBe("eligible");
    expect(cell(v, "orb_v2", "EUR_USD").state).toBe("ineligible");
    expect(cell(v, "ob_reclaim", "EUR_USD").state).toBe("vetoed");
    expect(cell(v, "sample", "EUR_USD").state).toBe("tier");
    expect(cell(v, "fade_lowvol", "USD_JPY").state).toBe("ineligible");
    expect(cell(v, "orb_v2", "USD_JPY").state).toBe("none");
  });

  it("kill switch / portfolio veto override every eligibility and raise P0 alerts", () => {
    const ks = viewPortfolio({ ...SNAP, limits: { ...SNAP.limits, killSwitch: true } }, N);
    expect(ks.alerts[0]!.kind).toBe("kill_switch");
    expect(cell(ks, "orb_v2", "GBP_USD").state).toBe("vetoed");
    const pv = viewPortfolio({ ...SNAP, vetoLog: [...SNAP.vetoLog, { at: N - 100, scope: "portfolio", limit: "exposure_cap", observed: 2.2, reason: "x", actor: "safety" }] }, N);
    expect(cell(pv, "orb_v2", "GBP_USD").state).toBe("vetoed");
    expect(pv.alerts.some((a) => a.kind === "veto")).toBe(true);
  });

  it("breaches raise alerts; a snapshot veto with no log entry is still surfaced", () => {
    const e = { ...SNAP.exposures[1]!, portfolioDrawdown: 5.5, currencyExposure: { USD: -2.4 }, vetoes: ["mystery_limit"] };
    const v = viewPortfolio({ ...SNAP, exposures: [e] }, N);
    expect(v.alerts.map((a) => a.kind).sort()).toEqual(["drawdown", "exposure", "veto", "veto"]);
    expect(v.alerts.some((a) => /no log entry: mystery_limit/.test(a.text))).toBe(true);
  });

  it("lifecycle: current stage + history; paused is inactive; stage without a validated tier is flagged", () => {
    const v = viewPortfolio(SNAP, N);
    const by = (id: string) => v.strategies.find((s) => s.id === id)!;
    expect(by("orb_v2")).toMatchObject({ stage: "shadow", inactive: false, tier: "validated" });
    expect(by("orb_v2").history.map((h) => h.stage)).toEqual(["research", "validated", "shadow"]);
    expect(by("fade_lowvol")).toMatchObject({ stage: "paused", inactive: true });
    expect(by("sample")).toMatchObject({ stage: "research", inactive: true });
    expect(v.allocTotal).toBeCloseTo(0.75);
    const flagged = viewPortfolio({ ...SNAP, lifecycle: [...SNAP.lifecycle, { strategy_id: "sample", strategy_version: "sample-0", stage: "shadow", since: N - 10, note: "" }] }, N);
    expect(flagged.strategies.find((s) => s.id === "sample")!.flag).toMatch(/not backed by a validated tier/);
    expect(LIFECYCLE_STAGES).not.toContain("live");
  });

  it("drill: position / cell / strategy resolve to the underlying decisions", () => {
    expect(drillDecisions(SNAP, N, { kind: "position", id: "pos:1" }).map((t) => t.trade_id)).toEqual(["tp:1"]);
    expect(drillDecisions(SNAP, N, { kind: "cell", strategy: "orb_v2", instrument: "EUR_USD" }).map((t) => t.trade_id)).toEqual(["tp:1", "tp:4"]);
    expect(drillDecisions(SNAP, N, { kind: "strategy", id: "fade_lowvol" }).map((t) => t.trade_id)).toEqual(["tp:3"]);
  });

  it("causal: nothing before it was knowable; outcomes hidden until exit; vetoes expire", () => {
    const v0 = viewPortfolio(SNAP, 0);
    expect(v0.exposure).toBeNull();
    expect(v0.strategies).toEqual([]);
    expect(v0.matrix.rows).toEqual([]);
    expect(v0.alerts).toEqual([]);
    const mid = viewPortfolio(SNAP, N - 10_000);
    expect(mid.exposure!.asOf).toBe(N - 20_000);
    expect(mid.positions.map((p) => p.id)).toEqual(["pos:3"]);
    const open3 = drillDecisions(SNAP, N - 10_000, { kind: "position", id: "pos:3" })[0]!;
    expect(open3.closed).toBe(false);
    expect(open3.R).toBeUndefined();
    expect(drillDecisions(SNAP, N - 6_000, { kind: "position", id: "pos:3" })[0]).toMatchObject({ closed: true, R: -0.6 });
    expect(activeVetoes(SNAP.vetoLog, N - 27_000).map((x) => x.limit)).toEqual(["daily_loss_limit"]);
    expect(activeVetoes(SNAP.vetoLog, N - 20_000)).toEqual([]);
    expect(activeVetoes(SNAP.vetoLog, N).map((x) => x.limit)).toEqual(["strategy_drawdown"]);
    expect(cell(viewPortfolio(SNAP, N - 2_500), "orb_v2", "EUR_USD").state).toBe("eligible");
  });
});

describe("F17 PortfolioRoot", () => {
  it("renders sample badge and every section", async () => {
    render(<PortfolioRoot />);
    await screen.findByRole("region", { name: "Eligibility matrix" });
    expect(document.querySelector(".dk-sample")).toHaveTextContent("sample");
    for (const n of ["Portfolio alerts", "Allocation", "Currency exposure", "Portfolio risk", "Open positions", "Eligibility matrix", "Strategy lifecycle", "Underlying decisions"]) {
      expect(screen.getByRole("region", { name: n })).toBeInTheDocument();
    }
    expect(screen.getByText(/Observe-only \(shadow, D6\)/)).toBeInTheDocument();
  });

  it("exposure renders with meters and text cues; P0 veto alert is always visible", async () => {
    render(<PortfolioRoot />);
    const exp = within(await screen.findByRole("region", { name: "Currency exposure" }));
    expect(exp.getByText("USD −1.7 (short)")).toBeInTheDocument();
    expect(exp.getByText("Near limit ⚠")).toBeInTheDocument();
    expect(exp.getAllByRole("meter")).toHaveLength(3);
    const alerts = within(screen.getByRole("region", { name: "Portfolio alerts" }));
    expect(alerts.getByRole("alert")).toHaveTextContent(/strategy_drawdown/);
    expect(within(screen.getByRole("region", { name: "Portfolio risk" })).getByText("Drawdown 3.2% of 5% max")).toBeInTheDocument();
  });

  it("matrix cells carry glyph+text and accessible names", async () => {
    render(<PortfolioRoot />);
    expect(await screen.findByRole("button", { name: "ob_reclaim on EUR_USD: vetoed" })).toHaveTextContent("⛔ vetoed");
    expect(screen.getByRole("button", { name: "orb_v2 on GBP_USD: eligible (shadow)" })).toHaveTextContent("✓ eligible (shadow)");
    expect(screen.getByRole("button", { name: "sample on EUR_USD: not eligible (tier)" })).toBeInTheDocument();
  });

  it("keyboard drill: matrix cell → underlying decisions with decision trace + journal link", async () => {
    const user = userEvent.setup();
    render(<PortfolioRoot />);
    const btn = await screen.findByRole("button", { name: "orb_v2 on EUR_USD: not eligible" });
    btn.focus();
    await user.keyboard("{Enter}");
    const d = within(screen.getByRole("region", { name: "Underlying decisions" }));
    expect(d.getByText(/rejected: correlation_cap/)).toBeInTheDocument();
    expect(d.getByRole("link", { name: "Open tp:4 in the trade journal" })).toHaveAttribute("href", "/?window=journal&trade=tp%3A4");
    await user.keyboard("{Enter}");
    expect(screen.getByText(/Select a position, matrix cell or strategy/)).toBeInTheDocument();
  });

  it("drill from a position shows an open trade's outcome as not yet known", async () => {
    const user = userEvent.setup();
    render(<PortfolioRoot />);
    await user.click(await screen.findByRole("button", { name: /orb_v2 · EUR\/USD long/ }));
    expect(within(screen.getByRole("region", { name: "Underlying decisions" })).getByText(/outcome not yet known/)).toBeInTheDocument();
  });

  it("lifecycle: stage glyph + text; inconsistent stage is flagged", async () => {
    render(<PortfolioRoot />);
    const lc = within(await screen.findByRole("region", { name: "Strategy lifecycle" }));
    expect(lc.getByText(/⏸ fade_lowvol — Paused/)).toBeInTheDocument();
    expect(lc.getAllByText(/Research → Validated → Shadow/)).toHaveLength(2);
  });

  it("read-only: no allocate/trade/approve/override controls, no inputs", async () => {
    render(<PortfolioRoot />);
    await screen.findByRole("region", { name: "Eligibility matrix" });
    const names = screen.getAllByRole("button").map((b) => (b.textContent ?? "").trim());
    expect(names.some((n) => /^(approve|allocate|rebalance|trade|buy|sell|close|override|lift|reset|promote|run|deploy|vault)/i.test(n))).toBe(false);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("causal: before any timestamp nothing is listed", async () => {
    render(<PortfolioRoot asOf={0} />);
    await waitFor(() => expect(screen.getByText("No open positions at this time.")).toBeInTheDocument());
    expect(screen.getByText("No eligibility decisions known at this time.")).toBeInTheDocument();
    expect(screen.getByText("● No active safety alerts at this time.")).toBeInTheDocument();
  });
});