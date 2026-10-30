import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_NOW } from "@/intel/fixtures";
import { WorkbenchSnapshotSchema } from "@/intel/workbenchContracts";
import { SAMPLE_WORKBENCH } from "@/intel/workbenchFixtures";
import { createMockIntelligenceSource } from "@/intel/mockSource";
import { decodeState, encodeState } from "@/url/urlState";
import { parseRole } from "@/window/role";
import { evidenceHref, evidenceQuery, jobAt, strategyTier, viewWorkbench } from "./workbench";
import { WorkbenchRoot } from "./WorkbenchRoot";

beforeEach(() => { window.history.replaceState(null, "", "/?window=workbench"); });

describe("F15 workbench (pure)", () => {
  it("fixture conforms; role parses; mock source is sample", async () => {
    expect(() => WorkbenchSnapshotSchema.parse(SAMPLE_WORKBENCH)).not.toThrow();
    expect(parseRole("?window=workbench")).toEqual({ kind: "workbench" });
    expect((await createMockIntelligenceSource().getWorkbench()).provenance.kind).toBe("sample");
    expect((await createMockIntelligenceSource({ missing: true }).getWorkbench()).data.jobs).toEqual([]);
  });

  it("job status renders for all four states with DAG depth and waiting-on", () => {
    const v = viewWorkbench(SAMPLE_WORKBENCH, SAMPLE_NOW);
    expect(v.jobs.map((j) => [j.node.job.id, j.status]).sort()).toEqual([["job:a", "done"], ["job:b", "running"], ["job:c", "queued"], ["job:d", "error"]]);
    expect(v.jobs.find((j) => j.node.job.id === "job:c")).toMatchObject({ depth: 2, waitingOn: ["job:b"] });
    expect(v.jobs.find((j) => j.node.job.id === "job:a")!.depth).toBe(0);
  });

  it("causal: job start/finish/result/error hidden until they happened", () => {
    const a = SAMPLE_WORKBENCH.jobs[0]!.job;
    expect(jobAt(a, a.created_at + 1).status).toBe("queued");
    const mid = jobAt(a, a.started_at! + 1);
    expect(mid.status).toBe("running");
    expect(mid.result_ref).toBeUndefined();
    const done = jobAt(a, a.finished_at!);
    expect([done.status, done.result_ref]).toEqual(["done", "exp:1"]);
    const err = SAMPLE_WORKBENCH.jobs[3]!.job;
    expect(jobAt(err, err.started_at! + 1).error).toBeUndefined();
    expect(viewWorkbench(SAMPLE_WORKBENCH, 0)).toMatchObject({ jobs: [], hypotheses: [], strategies: [], reports: [] });
  });

  it("reports/hypotheses/strategies appear only from their timestamps", () => {
    const early = viewWorkbench(SAMPLE_WORKBENCH, SAMPLE_NOW - 35_000);
    expect(early.reports).toHaveLength(0);
    expect(early.hypotheses.map((h) => h.h.id)).toEqual(["hyp:1"]);
    expect(viewWorkbench(SAMPLE_WORKBENCH, SAMPLE_NOW - 29_000).reports).toHaveLength(1);
  });

  it("Brain drafts are proposals; untested until a report exists", () => {
    const h = viewWorkbench(SAMPLE_WORKBENCH, SAMPLE_NOW).hypotheses;
    expect(h.find((x) => x.h.id === "hyp:1")).toMatchObject({ proposal: true, tested: true });
    expect(h.find((x) => x.h.id === "hyp:2")).toMatchObject({ proposal: false, tested: false });
  });

  it("tier is never overstated: validated needs a PASS; vault_confirmed is capped (ledger owns it)", () => {
    const sv = { ...SAMPLE_WORKBENCH.strategies[0]!, highestTier: "validated" as const };
    expect(strategyTier(sv, []).tier).toBe("in_sample");
    expect(strategyTier(sv, []).downgrade).toBeTruthy();
    const pass = { ...SAMPLE_WORKBENCH.reports[0]!, verdicts: [{ ...SAMPLE_WORKBENCH.reports[0]!.verdicts[0]!, status: "PASS" as const, passed: true }] };
    expect(strategyTier(sv, [pass]).tier).toBe("validated");
    expect(strategyTier({ ...sv, highestTier: "vault_confirmed" }, [pass]).tier).toBe("validated");
  });

  it("report shows total variants tested and low-sample flag", () => {
    const r = viewWorkbench(SAMPLE_WORKBENCH, SAMPLE_NOW).reports[0]!;
    expect(r.label).toBe("Tested 47 variants");
    expect(r.lowSample).toBe(true);
  });

  it("deep link to chart evidence resolves to Canvas Review + experiment; url state is additive and validated", () => {
    expect(evidenceHref("exp:1")).toBe("/?window=canvas&canvasMode=review&experiment=exp%3A1");
    const q = evidenceQuery("exp:1");
    expect(parseRole(q)).toEqual({ kind: "canvas" });
    expect(decodeState(q).experiment).toBe("exp:1");
    expect(decodeState(encodeState({ experiment: "exp:2" })).experiment).toBe("exp:2");
    expect(decodeState("experiment=bad id!").experiment).toBeUndefined();
  });

  it("dependency cycles cannot hang the view", () => {
    const [a, b] = SAMPLE_WORKBENCH.jobs;
    const cyc = { ...SAMPLE_WORKBENCH, jobs: [{ ...a!, dependsOn: ["job:b"] }, { ...b!, dependsOn: ["job:a"] }] };
    expect(viewWorkbench(cyc, SAMPLE_NOW).jobs).toHaveLength(2);
  });
});

describe("F15 WorkbenchRoot", () => {
  it("renders sample badge, four sections, job states as text+glyph", async () => {
    render(<WorkbenchRoot />);
    await screen.findByRole("region", { name: "Jobs" });
    expect(screen.getByText("sample")).toBeInTheDocument();
    for (const n of ["Hypotheses", "Jobs", "Strategy versions", "Validation reports"]) expect(screen.getByRole("region", { name: n })).toBeInTheDocument();
    const jobs = within(screen.getByRole("region", { name: "Jobs" }));
    for (const t of ["Done", "Running 40%", "Queued", "Error"]) expect(jobs.getByText(t)).toBeInTheDocument();
    expect(jobs.getByRole("alert")).toHaveTextContent(/dataset version missing/);
    expect(screen.getByText("Tested 47 variants")).toBeInTheDocument();
  });

  it("Brain draft labelled as a proposal; selecting scopes jobs; keyboard reachable", async () => {
    const user = userEvent.setup();
    render(<WorkbenchRoot />);
    const btn = await screen.findByRole("button", { name: /Order-block reclaim after London sweep/ });
    expect(btn).toHaveTextContent(/Proposal \(Master Brain\)/);
    await user.tab();
    expect(document.activeElement).toBe(btn);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("note")).toHaveTextContent(/proposal; it has no verdict/);
    expect(within(screen.getByRole("region", { name: "Jobs" })).queryByText("Regime-conditioned fade")).toBeNull();
  });

  it("chart-evidence links are accessible and point at the Canvas", async () => {
    render(<WorkbenchRoot />);
    const link = await screen.findByRole("link", { name: "Open chart evidence for Scan OB reclaim" });
    expect(link).toHaveAttribute("href", "/?window=canvas&canvasMode=review&experiment=exp%3A1");
    expect(screen.getByRole("link", { name: "Open chart evidence for report rep:1" })).toBeInTheDocument();
  });

  it("read-only: no run/promote/cancel/confirm/vault controls", async () => {
    render(<WorkbenchRoot />);
    await screen.findByRole("region", { name: "Jobs" });
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names.some((n) => /promote|confirm|vault|run|cancel|approve|deploy/i.test(n))).toBe(false);
  });

  it("causal: before any timestamp nothing is listed", async () => {
    render(<WorkbenchRoot asOf={0} />);
    await waitFor(() => expect(screen.getByText("No jobs known at this time.")).toBeInTheDocument());
  });
});