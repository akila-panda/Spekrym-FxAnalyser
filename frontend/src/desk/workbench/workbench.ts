/** F15 — Research Workbench view (pure, read-only, causal). Shows hypotheses, DAG jobs, strategy versions and
 *  validation reports. Never runs, promotes, cancels, or opens the VAULT (D11); Brain drafts are PROPOSALS.
 *  Causal: nothing before its timestamp; a job's start/finish/result/error are hidden until they happened. */
import type { EvidenceTier, Job } from "@/intel/contracts";
import type { HypothesisDraft, StrategyVersion, WorkbenchJob, WorkbenchReport, WorkbenchSnapshot } from "@/intel/workbenchContracts";

export const JOB_META: Record<Job["status"], { glyph: string; label: string }> = {
  queued: { glyph: "◌", label: "Queued" },
  running: { glyph: "◐", label: "Running" },
  done: { glyph: "✓", label: "Done" },
  error: { glyph: "✕", label: "Error" },
};
export const SAMPLE_FLOOR = 30;

export interface JobView {
  node: WorkbenchJob;
  status: Job["status"];
  /** DAG depth (0 = no dependencies). */
  depth: number;
  /** Visible dependencies that are not done yet. */
  waitingOn: string[];
  progress?: number;
  error?: string;
  evidenceExperimentId?: string;
}
export interface StrategyRow { sv: StrategyVersion; tier: EvidenceTier; downgrade?: string }
export interface HypothesisRow { h: HypothesisDraft; proposal: boolean; jobIds: string[]; reportIds: string[]; tested: boolean }
export interface ReportRow { r: WorkbenchReport; label: string; lowSample: boolean; passed: boolean }
export interface WorkbenchView {
  hypotheses: HypothesisRow[];
  jobs: JobView[];
  strategies: StrategyRow[];
  reports: ReportRow[];
}

/** The job as it was knowable at `asOf` (times are UTC seconds). */
export function jobAt(j: Job, asOf: number): Job {
  if (j.created_at > asOf) return j;
  const started = j.started_at !== undefined && j.started_at <= asOf;
  const finished = j.finished_at !== undefined && j.finished_at <= asOf;
  const out: Job = { id: j.id, kind: j.kind, status: "queued", created_at: j.created_at };
  if (started) { out.started_at = j.started_at; out.status = "running"; if (j.progress !== undefined) out.progress = j.progress; }
  if (finished) {
    out.finished_at = j.finished_at; out.status = j.status === "error" ? "error" : "done"; delete out.progress;
    if (j.result_ref) out.result_ref = j.result_ref;
    if (j.experiment_id) out.experiment_id = j.experiment_id;
    if (j.error) out.error = j.error;
  }
  return out;
}

function depths(nodes: WorkbenchJob[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.job.id, n]));
  const memo = new Map<string, number>();
  const walk = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0; // cycle guard: never loops
    const n = byId.get(id);
    if (!n) return 0;
    seen.add(id);
    const d = n.dependsOn.filter((x) => byId.has(x)).reduce((m, x) => Math.max(m, walk(x, seen) + 1), 0);
    seen.delete(id);
    memo.set(id, d);
    return d;
  };
  for (const n of nodes) walk(n.job.id, new Set());
  return memo;
}

export function strategyTier(sv: StrategyVersion, reports: WorkbenchReport[]): Pick<StrategyRow, "tier" | "downgrade"> {
  const claimed = sv.highestTier;
  const passed = reports.some((r) => r.strategyVersion === sv.version && r.verdicts.some((v) => v.passed && v.status === "PASS"));
  if (claimed === "vault_confirmed") return { tier: passed ? "validated" : "in_sample", downgrade: "VAULT confirmation is recorded in the validation ledger, not asserted here" };
  if (claimed === "validated" && !passed) return { tier: "in_sample", downgrade: "no visible PASS verdict for this version" };
  return { tier: claimed };
}

export function viewWorkbench(s: WorkbenchSnapshot, asOf: number): WorkbenchView {
  const nodes = s.jobs.filter((n) => n.job.created_at <= asOf).map((n) => ({ ...n, job: jobAt(n.job, asOf) }));
  const d = depths(nodes);
  const status = new Map(nodes.map((n) => [n.job.id, n.job.status]));
  const jobs: JobView[] = nodes.map((n) => ({
    node: n, status: n.job.status, depth: d.get(n.job.id) ?? 0,
    waitingOn: n.dependsOn.filter((x) => status.has(x) && status.get(x) !== "done"),
    progress: n.job.status === "running" ? n.job.progress : undefined,
    error: n.job.status === "error" ? n.job.error?.detail : undefined,
    evidenceExperimentId: n.job.status === "done" ? (n.job.experiment_id ?? n.job.result_ref) : undefined,
  })).sort((a, b) => a.depth - b.depth || a.node.job.created_at - b.node.job.created_at);

  const reports = s.reports.filter((r) => r.createdAt <= asOf);
  const hyps = s.hypotheses.filter((h) => h.asOf <= asOf);
  return {
    jobs,
    reports: reports.map((r) => ({
      r, passed: r.verdicts.some((v) => v.status === "PASS"),
      lowSample: r.verdicts.some((v) => v.n_trades < SAMPLE_FLOOR),
      label: `Tested ${r.experiment_count} variants`,
    })),
    strategies: s.strategies.filter((v) => v.createdAt <= asOf).map((sv) => ({ sv, ...strategyTier(sv, reports) })),
    hypotheses: hyps.map((h) => {
      const jobIds = jobs.filter((j) => j.node.hypothesisId === h.id).map((j) => j.node.job.id);
      const reportIds = reports.filter((r) => r.hypothesisId === h.id).map((r) => r.id);
      return { h, proposal: h.proposedBy === "master_brain", jobIds, reportIds, tested: reportIds.length > 0 };
    }),
  };
}

/** Deep link to the chart evidence for an experiment (Canvas · Review). Plain query string, no `?`. */
export function evidenceQuery(experimentId: string): string {
  const q = new URLSearchParams({ window: "canvas", canvasMode: "review", experiment: experimentId });
  return q.toString();
}
export const evidenceHref = (experimentId: string): string => `/?${evidenceQuery(experimentId)}`;