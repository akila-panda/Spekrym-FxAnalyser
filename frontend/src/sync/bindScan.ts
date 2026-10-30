import { rangeEquals, type DateRange } from "@/scan/dateRange";
import type { ParamValues } from "@/scan/paramState";
import { useScanStore, type ActiveSetup, type CatalogStatus, type PanelScan } from "@/scan/scanStore";
import { PANEL_ORDER, type Timeframe } from "@/types/market";
import { StrategiesResponseSchema, type ParamValue, type StrategyDef } from "@/types/schemas";
import { bindStore, isRecord, shallowEqual, type Binding, type BindContext, type StoreLike } from "./bindStore";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isTf = (v: unknown): v is Timeframe => typeof v === "string" && (PANEL_ORDER as readonly string[]).includes(v);
const isParam = (v: unknown): v is ParamValue =>
  typeof v === "boolean" || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

// ---------- inputs: strategy, params, range, active setup ----------
export interface ScanInputs {
  strategies: readonly StrategyDef[];
  strategyId: string | null;
  params: ParamValues;
  range: DateRange | null;
  active: ActiveSetup | null;
}
export interface ScanInputState extends ScanInputs {
  catalog: CatalogStatus;
  /** Local bookkeeping: bumped on a remote input change so the runner cancels in-flight scans. Never broadcast. */
  inputsVersion: number;
}

export const pickScanInputs = (s: ScanInputs): ScanInputs => ({
  strategies: s.strategies,
  strategyId: s.strategyId,
  params: s.params,
  range: s.range,
  active: s.active,
});

const sameIds = (a: readonly StrategyDef[], b: readonly StrategyDef[]): boolean =>
  a === b || (a.length === b.length && a.every((x, i) => x.id === b[i]?.id));

export const scanInputsEqual = (a: ScanInputs, b: ScanInputs): boolean =>
  sameIds(a.strategies, b.strategies) &&
  a.strategyId === b.strategyId &&
  shallowEqual(a.params, b.params) &&
  rangeEquals(a.range, b.range) &&
  (a.active === b.active || (!!a.active && !!b.active && a.active.tf === b.active.tf && a.active.id === b.active.id));

export function validateScanInputs(raw: unknown): ScanInputs | null {
  if (!isRecord(raw)) return null;
  const strategies = StrategiesResponseSchema.safeParse(raw.strategies);
  if (!strategies.success) return null;
  const { strategyId, params, range, active } = raw;
  if (!(strategyId === null || typeof strategyId === "string")) return null;
  if (!isRecord(params) || !Object.values(params).every(isParam)) return null;
  let r: DateRange | null = null;
  if (range !== null) {
    if (!isRecord(range) || typeof range.from !== "string" || typeof range.to !== "string") return null;
    if (!DATE_RE.test(range.from) || !DATE_RE.test(range.to)) return null;
    r = { from: range.from, to: range.to };
  }
  let a: ActiveSetup | null = null;
  if (active !== null) {
    if (!isRecord(active) || typeof active.id !== "string" || !isTf(active.tf)) return null;
    a = { tf: active.tf, id: active.id };
  }
  return { strategies: strategies.data, strategyId, params: params as ParamValues, range: r, active: a };
}

export function bindScanInputs(
  ctx: BindContext,
  store: StoreLike<ScanInputState> = useScanStore as unknown as StoreLike<ScanInputState>,
): Binding {
  return bindStore<ScanInputState, ScanInputs>({
    ...ctx,
    slice: "scan",
    store,
    pick: pickScanInputs,
    validate: validateScanInputs,
    equals: scanInputsEqual,
    toPatch: (p, s) => {
      const inputsChanged =
        p.strategyId !== s.strategyId || !shallowEqual(p.params, s.params) || !rangeEquals(p.range, s.range);
      return {
        strategies: sameIds(p.strategies, s.strategies) ? s.strategies : p.strategies,
        ...(p.strategies.length > 0 ? { catalog: "ready" as const } : {}),
        strategyId: p.strategyId,
        params: p.params,
        range: p.range,
        active: p.active,
        inputsVersion: inputsChanged ? s.inputsVersion + 1 : s.inputsVersion,
      };
    },
  });
}

// ---------- results: per-chart scan state ----------
export interface ScanResultsFields {
  panels: Record<Timeframe, PanelScan>;
}

const STATUS = ["idle", "running", "done", "error", "unsupported"];

// Results hold parsed timestamps (numbers), so the wire schemas cannot be re-applied; check the structure instead.
const validResult = (v: unknown): boolean =>
  isRecord(v) && Array.isArray(v.setups) && isRecord(v.summary) && typeof v.summary.n_valid === "number";

function validPanel(v: unknown): v is PanelScan {
  if (!isRecord(v)) return false;
  if (typeof v.status !== "string" || !STATUS.includes(v.status)) return false;
  if (typeof v.stale !== "boolean") return false;
  if (v.result !== undefined && !validResult(v.result)) return false;
  return (["error", "reason", "chosenSetupId"] as const).every((k) => v[k] === undefined || typeof v[k] === "string");
}

export function validateScanResults(raw: unknown): ScanResultsFields | null {
  if (!isRecord(raw) || !isRecord(raw.panels)) return null;
  const out: Partial<Record<Timeframe, PanelScan>> = {};
  for (const tf of PANEL_ORDER) {
    const p = raw.panels[tf];
    if (!validPanel(p)) return null;
    out[tf] = p;
  }
  for (const tf of ["D", "W"] as const) out[tf] = validPanel(raw.panels[tf]) ? (raw.panels[tf] as PanelScan) : { status: "idle", stale: false };
  return { panels: out as Record<Timeframe, PanelScan> };
}

export function bindScanResults(
  ctx: BindContext,
  store: StoreLike<ScanResultsFields> = useScanStore as unknown as StoreLike<ScanResultsFields>,
): Binding {
  return bindStore<ScanResultsFields, ScanResultsFields>({
    ...ctx,
    slice: "scanResults",
    store,
    pick: (s) => ({ panels: s.panels }),
    validate: validateScanResults,
    equals: (a, b) => Object.is(a.panels, b.panels),
    toPatch: (p) => ({ panels: p.panels }),
  });
}