import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_NOW as N } from "@/intel/fixtures";
import { OpsSnapshotSchema } from "@/intel/opsContracts";
import { SAMPLE_OPS as SNAP } from "@/intel/opsFixtures";
import { createMockIntelligenceSource } from "@/intel/mockSource";
import { parseRole } from "@/window/role";
import { brokerState, feedState, jobState, viewOps } from "./ops";
import { OpsRoot } from "./OpsRoot";

beforeEach(() => { window.history.replaceState(null, "", "/?window=ops"); });
const feed = (v: ReturnType<typeof viewOps>, id: string) => v.feeds.find((f) => f.obs.feed_id === id)!;

describe("F18 ops view (pure)", () => {
  it("fixture conforms; role parses; mock source is sample", async () => {
    expect(() => OpsSnapshotSchema.parse(SNAP)).not.toThrow();
    expect(parseRole("?window=ops")).toEqual({ kind: "ops" });
    expect((await createMockIntelligenceSource().getOps()).provenance.kind).toBe("sample");
    expect((await createMockIntelligenceSource({ missing: true }).getOps()).data.feeds).toEqual([]);
  });

  it("feed state is derived at as-of: stale beats a fresh-looking reading; gaps/low quality = degraded", () => {
    const v = viewOps(SNAP, N);
    expect(feed(v, "candles:GBP_USD").state).toBe("stale");
    expect(feed(v, "calendar:macro").state).toBe("degraded");
    expect(feed(v, "calendar:macro").reasons.join(" ")).toMatch(/gap.*not filled/);
    expect(feed(v, "candles:EUR_USD").state).toBe("ok");
    expect(v.feeds.map((f) => f.state)).toEqual(["stale", "degraded", "ok", "ok"]);
    expect(v.feedCounts).toEqual({ ok: 2, degraded: 1, stale: 1 });
    expect(feedState({ ...SNAP.feeds[0]!, lastDataAt: N - 10_000 }, N).state).toBe("stale");
  });

  it("P0 alerts: stale feed, degraded feed, broker discrepancy, drift breach — with decision scope", () => {
    const v = viewOps(SNAP, N);
    expect(v.alerts.map((a) => a.kind).sort()).toEqual(["broker", "drift", "feed", "feed"]);
    expect(v.alerts.find((a) => a.id === "feed:candles:GBP_USD")!.text).toMatch(/Stale feed.*affects live decisions/);
    expect(v.alerts.find((a) => a.id === "drift:fcst-v0")!.text).toMatch(/calibration withheld/);
  });

  it("broker: disconnected > stale > mismatch > ok", () => {
    const b = SNAP.broker[1]!;
    expect(brokerState(b, N)).toBe("mismatch");
    expect(brokerState({ ...b, discrepancies: 0 }, N)).toBe("ok");
    expect(brokerState({ ...b, lastSyncAt: N - 1_000 }, N)).toBe("stale");
    expect(brokerState({ ...b, connected: false }, N)).toBe("disconnected");
  });

  it("jobs: status derived from timestamps; error hidden until finished; late runs flagged", () => {
    const by = (id: string, t: number) => jobState(SNAP.jobs.find((j) => j.job_id === id)!, t);
    expect(by("job:backfill", N)).toEqual({ state: "done" });
    expect(by("job:regime", N)).toMatchObject({ state: "error", error: expect.stringMatching(/input gap/) });
    expect(by("job:regime", N - 6_800)).toEqual({ state: "running" });
    expect(by("job:drift", N)).toEqual({ state: "running" });
    expect(by("job:drift", N + 1_200)).toEqual({ state: "stalled" });
    expect(by("job:nightly", N)).toEqual({ state: "queued" });
    expect(by("job:nightly", N - 200)).toBeNull();
  });

  it("drift: band + trend; a claimed-calibrated model that breaches is not calibrated", () => {
    const v = viewOps(SNAP, N);
    const r = v.drift.find((d) => d.obs.model_id === "regime-v1")!;
    expect(r).toMatchObject({ band: "near", trend: "↑", calibrated: true });
    expect(r.history).toHaveLength(2);
    const f = v.drift.find((d) => d.obs.model_id === "fcst-v0")!;
    expect(f).toMatchObject({ band: "breach", trend: "new", calibrated: false });
    const claimed = viewOps({ ...SNAP, drift: [{ ...SNAP.drift[2]!, calibrated: true }] }, N);
    expect(claimed.drift[0]!.calibrated).toBe(false);
  });

  it("causal: nothing before it was knowable; later readings are hidden", () => {
    const v0 = viewOps(SNAP, 0);
    expect(v0.feeds).toEqual([]);
    expect(v0.broker).toEqual([]);
    expect(v0.jobs).toEqual([]);
    expect(v0.drift).toEqual([]);
    expect(v0.alerts).toEqual([]);
    const mid = viewOps(SNAP, N - 9_000);
    expect(feed(mid, "candles:GBP_USD").obs.at).toBe(N - 20_000);
    expect(mid.broker[0]!.obs.at).toBe(N - 10_000);
    expect(mid.drift.map((d) => d.obs.model_id)).toEqual(["regime-v1"]);
    expect(mid.jobs.map((j) => [j.job.job_id, j.state])).toEqual([["job:backfill", "queued"]]);
  });
});

describe("F18 OpsRoot", () => {
  it("renders sample badge and every section", async () => {
    render(<OpsRoot />);
    await screen.findByRole("region", { name: "Feed quality" });
    expect(document.querySelector(".dk-sample")).toHaveTextContent("sample");
    for (const n of ["Ops alerts", "Feed quality", "Broker sync", "Compute jobs", "Model drift"]) expect(screen.getByRole("region", { name: n })).toBeInTheDocument();
    expect(screen.getByText(/Observe-only \(D6\)/)).toBeInTheDocument();
  });

  it("P0 stale-feed alert is visible with glyph + text, and stays when expert detail is off", async () => {
    render(<OpsRoot />);
    const alerts = within(await screen.findByRole("region", { name: "Ops alerts" }));
    expect(alerts.getAllByRole("alert").some((a) => /⛔ Stale feed — GBP\/USD candles/.test(a.textContent ?? ""))).toBe(true);
    const feeds = within(screen.getByRole("region", { name: "Feed quality" }));
    expect(feeds.getByText(/⛔ GBP\/USD candles — Stale/)).toBeInTheDocument();
    expect(feeds.getByText(/Stale 1/)).toBeInTheDocument();
  });

  it("expert toggle is keyboard-operable, reveals raw metrics, never hides P0 alerts", async () => {
    const user = userEvent.setup();
    render(<OpsRoot />);
    const btn = await screen.findByRole("button", { name: /Expert detail off/ });
    expect(screen.queryByText(/calibration error/)).toBeNull();
    btn.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /Expert detail on/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText(/calibration error/).length).toBeGreaterThan(0);
    expect(within(screen.getByRole("region", { name: "Ops alerts" })).getAllByRole("alert").length).toBe(4);
    await user.keyboard("{Enter}");
    expect(screen.queryByText(/calibration error/)).toBeNull();
    expect(within(screen.getByRole("region", { name: "Ops alerts" })).getAllByRole("alert").length).toBe(4);
  });

  it("jobs and drift carry glyph + text cues; meters have accessible names", async () => {
    render(<OpsRoot />);
    const jobs = within(await screen.findByRole("region", { name: "Compute jobs" }));
    expect(jobs.getByText(/✕ regime recompute — Error/)).toBeInTheDocument();
    expect(jobs.getByText(/◌ nightly validation — Queued/)).toBeInTheDocument();
    const drift = within(screen.getByRole("region", { name: "Model drift" }));
    expect(drift.getByText("Drift limit breached ✕")).toBeInTheDocument();
    expect(drift.getByRole("meter", { name: "fcst-v0 drift versus limit" })).toBeInTheDocument();
    expect(drift.getByText("calibration not established")).toBeInTheDocument();
  });

  it("read-only: no restart/reconnect/backfill/silence control, no inputs", async () => {
    render(<OpsRoot />);
    await screen.findByRole("region", { name: "Feed quality" });
    const names = screen.getAllByRole("button").map((b) => (b.textContent ?? "").trim());
    expect(names.some((n) => /^(restart|reconnect|retry|backfill|run|silence|dismiss|ack|resolve|cancel|kill|reset|promote|vault)/i.test(n))).toBe(false);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("causal: before any timestamp nothing is listed", async () => {
    render(<OpsRoot asOf={0} />);
    await waitFor(() => expect(screen.getByText("No feed readings known at this time.")).toBeInTheDocument());
    expect(screen.getByText("No broker sync known at this time.")).toBeInTheDocument();
    expect(screen.getByText("No jobs known at this time.")).toBeInTheDocument();
    expect(screen.getByText("● No active data or ops alerts at this time.")).toBeInTheDocument();
  });
});