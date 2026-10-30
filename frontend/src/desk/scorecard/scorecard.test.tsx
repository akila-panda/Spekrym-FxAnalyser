import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { detectAll } from "@/desk/detect";
import { runKernel } from "@/desk/kernel/kernel";
import { DEFAULTS } from "@/desk/methodology/defaults";
import { useMethodologyStore, activeMethodology } from "@/desk/methodology/methodologyStore";
import { deepCandles } from "@/desk/mock/deepMock";
import { observePair, sessionOf, type Obs, type TfData } from "./observe";
import { FILL_HORIZON_BARS, MIN_N, SCORE_TFS } from "./protocol";
import { ScorecardBody } from "./ScorecardWidget";
import { useScorecardStore } from "./scorecardStore";
import { aggregate, toRow, wilson } from "./stats";
import { TF_SECONDS, type Timeframe } from "@/types/market";

const BAD = /\b(buy|sell|long|short|reversal|likely|probab\w*|will)\b/i;
const tfData = (tf: Timeframe, upTo?: number): TfData => {
  const all = deepCandles("EUR_USD", tf);
  const candles = upTo ? all.slice(0, upTo) : all;
  const last = candles[candles.length - 1];
  const r = detectAll({ candles, pair: "EUR_USD", tf, asOf: Infinity, dataKind: "sample", dataVersion: `${candles.length}:${last?.time}` }, DEFAULTS);
  return { tf, objects: r.objects, kernel: runKernel(candles, { pair: "EUR_USD", tf, asOf: Infinity }, DEFAULTS) };
};

beforeEach(() => { useScorecardStore.getState().clear(); });

describe("stats", () => {
  it("wilson interval", () => {
    const w = wilson(5, 10)!;
    expect(w.lo).toBeCloseTo(0.2366, 3);
    expect(w.hi).toBeCloseTo(0.7634, 3);
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(0, 30)!.lo).toBe(0);
    expect(wilson(30, 30)!.hi).toBe(1);
  });
  it("suppresses small samples (counts only, no share/interval)", () => {
    const r = toRow("x", 3, MIN_N - 1);
    expect(r).toMatchObject({ suppressed: true, rate: null, lo: null, hi: null, k: 3, n: MIN_N - 1 });
    expect(toRow("y", 10, MIN_N)).toMatchObject({ suppressed: false, rate: 0.5 });
  });
  it("aggregate groups, puts All first, cohort only when present", () => {
    const mk = (i: number, o: Partial<Obs>): Obs => ({ id: String(i), metric: "reaction", pair: "EUR_USD", tf: "H1", type: "fvg", direction: "bull", session: "ny", cohort: null, success: i % 2 === 0, t: i, ...o });
    const obs = [...Array.from({ length: 25 }, (_, i) => mk(i, { cohort: "nested" })), ...Array.from({ length: 5 }, (_, i) => mk(100 + i, { cohort: "single" })), mk(200, { metric: "fvgFill" })];
    const rows = aggregate(obs, "reaction", "cohort");
    expect(rows.map((r) => r.key)).toEqual(["All", "nested", "single"]);
    expect(rows[1]!.suppressed).toBe(false);
    expect(rows[2]!.suppressed).toBe(true);
    expect(aggregate(obs, "fvgFill", "cohort")).toEqual([]);
    expect(rows[0]!.n).toBe(30);
  });
});

describe("sessionOf", () => {
  it("OQ-7 approx hours: asia / overlap / ny / off (summer)", () => {
    const t = (h: number) => Date.UTC(2025, 6, 15, h) / 1000;
    expect(sessionOf(t(3), DEFAULTS)).toBe("asia");
    expect(sessionOf(t(8), DEFAULTS)).toBe("london");
    expect(sessionOf(t(13), DEFAULTS)).toBe("overlap");
    expect(sessionOf(t(18), DEFAULTS)).toBe("ny");
    expect(sessionOf(t(22), DEFAULTS)).toBe("off");
  });
});

describe("observePair (deep sample)", () => {
  let data: TfData[];
  let obs: Obs[];
  beforeAll(() => { data = SCORE_TFS.map((tf) => tfData(tf)); obs = observePair("EUR_USD", data, DEFAULTS); });

  it("produces every metric; ids are unique per object+metric; cohorts only on reaction", () => {
    const metrics = new Set(obs.map((o) => o.metric));
    expect(metrics.size).toBeGreaterThanOrEqual(3);
    expect(new Set(obs.map((o) => o.id)).size).toBe(obs.length);
    expect(obs.filter((o) => o.metric !== "reaction").every((o) => o.cohort === null)).toBe(true);
    expect(obs.filter((o) => o.metric === "reaction").every((o) => o.cohort !== null)).toBe(true);
  });
  it("right-censors: FVGs whose fill window runs past the data end are excluded", () => {
    for (const d of data) {
      const sec = TF_SECONDS[d.tf];
      const last = d.kernel.bars[d.kernel.bars.length - 1]!.time + sec;
      const fvgs = d.objects.filter((o) => o.type === "fvg");
      const used = obs.filter((o) => o.metric === "fvgFill" && o.tf === d.tf).length;
      const eligible = fvgs.filter((o) => o.known_at + FILL_HORIZON_BARS * sec <= last).length;
      expect(used).toBe(eligible);
    }
  });
  it("no lookahead: observations on a prefix equal the full-history ones wherever their window fits", () => {
    const n = deepCandles("EUR_USD", "H1").length;
    const pre = observePair("EUR_USD", [tfData("H1", Math.floor(n * 0.7))], DEFAULTS);
    const full = observePair("EUR_USD", [tfData("H1")], DEFAULTS);
    const byId = new Map(full.map((o) => [o.id, o]));
    expect(pre.length).toBeGreaterThan(0);
    for (const o of pre) expect(byId.get(o.id)?.success, o.id).toBe(o.success);
  });
});

describe("scorecard run + widget", () => {
  it("never writes the methodology store; stamps rulesVersion", async () => {
    const before = JSON.stringify(useMethodologyStore.getState().active);
    const m = activeMethodology();
    await useScorecardStore.getState().run(m.cfg, m.rulesVersion, { pairs: ["EUR_USD"] });
    expect(useScorecardStore.getState()).toMatchObject({ status: "done", rulesVersion: m.rulesVersion });
    expect(useScorecardStore.getState().obs.length).toBeGreaterThan(0);
    expect(JSON.stringify(useMethodologyStore.getState().active)).toBe(before);
  }, 60000);

  it("shows not-computed state, labels exploratory + sample, tables with counts, no forecast language", async () => {
    const user = userEvent.setup();
    const m = activeMethodology();
    render(<ScorecardBody />);
    expect(screen.getByText("exploratory")).toBeInTheDocument();
    expect(screen.getByText(/Not computed yet/)).toBeInTheDocument();
    await act(async () => { await useScorecardStore.getState().run(m.cfg, m.rulesVersion, { pairs: ["EUR_USD"] }); });
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    const t = screen.getByRole("table");
    expect(within(t).getAllByRole("row").length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: /H2/ }));
    expect(screen.getByRole("option", { name: "Nested vs single" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /H1/ }));
    expect(screen.queryByRole("option", { name: "Nested vs single" })).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(BAD);
  }, 60000);
});