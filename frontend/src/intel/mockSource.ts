/** F0 — IntelligenceSource interface + a seeded mock. Beside DeskSource; serves the intelligence
 *  records (regime, scenarios, trades, portfolio, verdicts, jobs) wrapped in Sourced<T>, always "sample".
 *  A real `api` source (later phase) implements the same interface. Detectors/objects stay on DeskSource. */
import type { Pair } from "@/types/market";
import type { Sourced, SourcedProvenance } from "@/desk/types/schemas";
import type {
  IntelligenceInsight, RegimeSnapshot, ScenarioSpecification, TradeRecord,
  PortfolioExposure, Verdict, Job, LedgerSnapshot,
} from "./contracts";
import type { WorkbenchSnapshot } from "./workbenchContracts";
import { SAMPLE_WORKBENCH } from "./workbenchFixtures";
import type { BrainConsoleSnapshot } from "./brainContracts";
import { SAMPLE_BRAIN } from "./brainFixtures";
import type { PortfolioCommandSnapshot } from "./portfolioContracts";
import { SAMPLE_PORTFOLIO_COMMAND } from "./portfolioFixtures";
import type { OpsSnapshot } from "./opsContracts";
import { SAMPLE_OPS } from "./opsFixtures";
import {
  SAMPLE_INSIGHTS, SAMPLE_REGIME, SAMPLE_SCENARIOS, SAMPLE_TRADES,
  SAMPLE_PORTFOLIO, SAMPLE_VERDICTS, SAMPLE_JOB, SAMPLE_NOW,
} from "./fixtures";
import { SAMPLE_LEDGER } from "./ledgerFixtures";

export interface IntelligenceSource {
  readonly kind: "mock" | "api";
  getInsights(pair: Pair, signal?: AbortSignal): Promise<Sourced<IntelligenceInsight[]>>;
  getRegime(pair: Pair, signal?: AbortSignal): Promise<Sourced<RegimeSnapshot>>;
  getScenarios(pair: Pair, signal?: AbortSignal): Promise<Sourced<ScenarioSpecification[]>>;
  getTrades(pair: Pair, signal?: AbortSignal): Promise<Sourced<TradeRecord[]>>;
  getPortfolio(signal?: AbortSignal): Promise<Sourced<PortfolioExposure>>;
  getVerdicts(signal?: AbortSignal): Promise<Sourced<Verdict[]>>;
  getLedger(signal?: AbortSignal): Promise<Sourced<LedgerSnapshot>>;
  getWorkbench(signal?: AbortSignal): Promise<Sourced<WorkbenchSnapshot>>;
  getBrain(signal?: AbortSignal): Promise<Sourced<BrainConsoleSnapshot>>;
  getPortfolioCommand(signal?: AbortSignal): Promise<Sourced<PortfolioCommandSnapshot>>;
  getOps(signal?: AbortSignal): Promise<Sourced<OpsSnapshot>>;
  getJob(id: string, signal?: AbortSignal): Promise<Sourced<Job>>;
}

export interface MockIntelOptions {
  now?: number;
  /** When true, lists come back empty (missing-data scenario). */
  missing?: boolean;
}

const prov = (now: number): SourcedProvenance => ({ kind: "sample", asOf: now, fetchedAt: now });
const wrap = <T>(data: T, now: number): Sourced<T> => ({ data, provenance: prov(now) });

export function createMockIntelligenceSource(opts: MockIntelOptions = {}): IntelligenceSource {
  const now = opts.now ?? SAMPLE_NOW;
  const missing = opts.missing ?? false;
  const list = <T>(xs: T[]): T[] => (missing ? [] : xs);
  return {
    kind: "mock",
    async getInsights() { return wrap(list(SAMPLE_INSIGHTS), now); },
    async getRegime() { return wrap(SAMPLE_REGIME, now); },
    async getScenarios() { return wrap(list(SAMPLE_SCENARIOS), now); },
    async getTrades() { return wrap(list(SAMPLE_TRADES), now); },
    async getPortfolio() { return wrap(SAMPLE_PORTFOLIO, now); },
    async getVerdicts() { return wrap(list(SAMPLE_VERDICTS), now); },
    async getLedger() { return wrap(missing ? { ...SAMPLE_LEDGER, experiments: [], experiment_count: 0 } : SAMPLE_LEDGER, now); },
    async getWorkbench() { return wrap(missing ? { hypotheses: [], strategies: [], jobs: [], reports: [] } : SAMPLE_WORKBENCH, now); },
    async getBrain() { return wrap(missing ? { objectives: [], proposals: [], permissions: [], budgets: [], decisions: [] } : SAMPLE_BRAIN, now); },
    async getPortfolioCommand() { return wrap(missing ? { ...SAMPLE_PORTFOLIO_COMMAND, exposures: [], eligibility: [], allocations: [], positions: [], lifecycle: [], vetoLog: [], trades: [] } : SAMPLE_PORTFOLIO_COMMAND, now); },
    async getOps() { return wrap(missing ? { feeds: [], broker: [], jobs: [], drift: [] } : SAMPLE_OPS, now); },
    async getJob() { return wrap(SAMPLE_JOB, now); },
  };
}