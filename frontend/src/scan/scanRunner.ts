import type { DataSource } from "@/api/dataSource";
import { ApiError } from "@/api/client";
import { getDataSource } from "@/api/sourceFactory";
import { useViewStore } from "@/store/viewStore";
import { ContractError } from "@/types/schemas";
import { PANEL_ORDER, type Timeframe } from "@/types/market";
import type { ScanRequest, ScanResult } from "@/types";
import { rangeToRequest, validateRange } from "./dateRange";
import { validateAll, toRequestParams } from "./paramState";
import { selectStrategyDef, useScanStore } from "./scanStore";

export const MAX_IN_FLIGHT = 2;

// ---------- concurrency limiter (abort-aware) ----------
const abortError = () => new ApiError("aborted", "Request cancelled");
let active = 0;
const waiting: Array<() => void> = [];

async function acquire(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortError();
  if (active < MAX_IN_FLIGHT) {
    active++;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const go = () => {
      signal.removeEventListener("abort", onAbort);
      resolve(); // the slot is handed over, `active` stays the same
    };
    const onAbort = () => {
      const i = waiting.indexOf(go);
      if (i >= 0) waiting.splice(i, 1);
      reject(abortError());
    };
    waiting.push(go);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

// ---------- per-panel bookkeeping ----------
const controllers = new Map<Timeframe, AbortController>();
const tokens: Record<Timeframe, number> = { M1: 0, M5: 0, M15: 0, H1: 0, H4: 0 };

/** Aborts every scan in flight or queued. Late responses are dropped. */
export function cancelAll(): void {
  for (const tf of PANEL_ORDER) tokens[tf]++;
  controllers.forEach((c) => c.abort());
  controllers.clear();
}

// A shared input changed (strategy, params, range, pair): nothing in flight is still valid.
useScanStore.subscribe((s, prev) => {
  if (s.inputsVersion !== prev.inputsVersion) cancelAll();
});

export function scanErrorMessage(e: unknown): string {
  if (e instanceof ContractError) {
    return "Scan failed: the server sent data the app could not read. Check that the backend and frontend versions match, then scan again.";
  }
  if (e instanceof ApiError) {
    if (e.kind === "network") return "Scan failed: the server did not respond. Check that the backend is running, then scan again.";
    if (e.kind === "timeout") return "Scan timed out. Narrow the date range, then scan again.";
    if (e.kind === "contract") return "Scan failed: the server sent data the app could not read. Check that the backend and frontend versions match, then scan again.";
    if (e.status !== undefined && e.status >= 400 && e.status < 500) return `Scan rejected: ${e.message}. Adjust the parameters or range, then scan again.`;
    return `Scan failed: ${e.message}. Try again in a moment.`;
  }
  return "Scan failed unexpectedly. Try again.";
}

/** Builds the request for one chart, or a message saying what to fix. */
export function buildRequest(tf: Timeframe): { ok: true; request: ScanRequest } | { ok: false; message: string } {
  const s = useScanStore.getState();
  const def = selectStrategyDef(s);
  if (!def) return { ok: false, message: "Pick a strategy, then scan." };
  const errors = validateAll(def.params, s.params);
  if (Object.keys(errors).length > 0) return { ok: false, message: "Can't scan: fix the highlighted parameters in the left rail, then scan again." };
  const rangeError = validateRange(s.range, s.bounds ?? { first: null, last: null });
  if (rangeError || !s.range) return { ok: false, message: `Can't scan: ${rangeError ?? "choose a date range"} Fix the range, then scan again.` };
  return {
    ok: true,
    request: {
      strategy_id: def.id,
      pair: useViewStore.getState().pair,
      timeframe: tf,
      ...rangeToRequest(s.range),
      params: toRequestParams(def.params, s.params),
    },
  };
}

/** After a scan lands: keep the active setup if it survived, else activate the first valid one when nothing is active. */
function autoChoose(tf: Timeframe): void {
  const st = useScanStore.getState();
  if (st.active) return; // still valid: the store already refreshed its annotations
  const first = st.panels[tf].result?.setups.find((x) => x.status === "valid");
  if (first) st.activate(tf, first.id);
}

/** Scans one chart. Unsupported charts are skipped. A new scan on a chart aborts its previous one. */
export async function scanPanel(tf: Timeframe, source: DataSource = getDataSource()): Promise<void> {
  const st = useScanStore.getState();
  const def = selectStrategyDef(st);
  if (!def || !def.supported_timeframes.includes(tf)) return;

  const built = buildRequest(tf);
  if (!built.ok) {
    controllers.get(tf)?.abort();
    tokens[tf]++;
    st.fail(tf, built.message);
    return;
  }

  controllers.get(tf)?.abort();
  const ctl = new AbortController();
  controllers.set(tf, ctl);
  const token = ++tokens[tf];
  st.begin(tf);

  const current = () => token === tokens[tf] && !ctl.signal.aborted;
  try {
    await acquire(ctl.signal);
    let result: ScanResult;
    try {
      result = await source.runScan(built.request, ctl.signal);
    } finally {
      release();
    }
    if (!current()) return; // late response for old inputs
    useScanStore.getState().finish(tf, result);
    autoChoose(tf);
  } catch (e) {
    if (!current()) return;
    useScanStore.getState().fail(tf, scanErrorMessage(e));
  } finally {
    if (controllers.get(tf) === ctl) controllers.delete(tf);
  }
}

/** One request per supported chart, at most MAX_IN_FLIGHT at a time. Each chart finishes on its own. */
export async function scanAll(source: DataSource = getDataSource()): Promise<void> {
  const def = selectStrategyDef(useScanStore.getState());
  if (!def) return;
  const tfs = PANEL_ORDER.filter((tf) => def.supported_timeframes.includes(tf));
  await Promise.all(tfs.map((tf) => scanPanel(tf, source)));
}