import type { DataSource } from "@/api/dataSource";
import { ApiError } from "@/api/client";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import scanFixture from "@/test/fixtures/scanResult.json";
import strategiesFixture from "@/test/fixtures/strategies.json";
import { parseScanResult, parseStrategies, type ScanRequest, type ScanResult } from "@/types";
import type { Timeframe } from "@/types/market";
import { MAX_IN_FLIGHT, buildRequest, cancelAll, scanAll, scanErrorMessage, scanPanel } from "./scanRunner";
import { useScanStore } from "./scanStore";

const strategies = parseStrategies(strategiesFixture); // ORB: M1, M5, M15
const base = parseScanResult(scanFixture);
const resultFor = (tf: Timeframe): ScanResult => ({ ...base, timeframe: tf });

interface Pending { req: ScanRequest; resolve: (r: ScanResult) => void; reject: (e: unknown) => void; signal?: AbortSignal }

function deferredSource() {
  const pending: Pending[] = [];
  let inFlight = 0;
  let peak = 0;
  const source: DataSource = {
    kind: "mock",
    getCandles: async () => [],
    getBounds: async () => { throw new Error("unused"); },
    getStrategies: async () => strategies,
    runScan: (req, signal) =>
      new Promise<ScanResult>((resolve, reject) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        const done = () => { inFlight--; };
        signal?.addEventListener("abort", () => { done(); reject(new ApiError("aborted", "Request cancelled")); }, { once: true });
        pending.push({ req, signal, resolve: (r) => { done(); resolve(r); }, reject: (e) => { done(); reject(e); } });
      }),
  };
  return { source, pending, peak: () => peak };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const st = () => useScanStore.getState();

beforeEach(() => {
  cancelAll();
  st().reset();
  useAnnotationStore.getState().setSetup(null);
  useViewStore.setState({ pair: "EUR_USD", asOf: null });
  st().setBounds({ first: Date.parse("2025-01-01T00:00:00Z") / 1000, last: Date.parse("2025-06-30T12:00:00Z") / 1000 });
  st().setCatalog(strategies);
  st().setRange({ from: "2025-06-01", to: "2025-06-30" });
});

describe("scanRunner", () => {
  it("builds the request from shared inputs", () => {
    const r = buildRequest("M5");
    expect(r.ok && r.request).toMatchObject({
      strategy_id: "orb", pair: "EUR_USD", timeframe: "M5", from: "2025-06-01T00:00:00Z", to: "2025-06-30T23:59:59Z",
    });
  });

  it("refuses to scan with invalid params or range and says what to fix", async () => {
    const d = deferredSource();
    const bad = strategies[0]!.params.find((p) => p.type === "integer")!;
    st().setParam(bad.key, "abc");
    await scanPanel("M5", d.source);
    expect(d.pending).toHaveLength(0);
    expect(st().panels.M5.status).toBe("error");
    expect(st().panels.M5.error).toMatch(/fix the highlighted parameters/i);
    st().resetParams();
    st().setRange({ from: "2025-06-30", to: "2025-06-01" });
    await scanPanel("M5", d.source);
    expect(st().panels.M5.error).toMatch(/Swap them/);
  });

  it("scans one chart and shows its count; auto-selects the first valid setup", async () => {
    const d = deferredSource();
    const p = scanPanel("M5", d.source);
    await flush();
    expect(st().panels.M5.status).toBe("running");
    expect(d.pending[0]!.req.timeframe).toBe("M5");
    d.pending[0]!.resolve(resultFor("M5"));
    await p;
    expect(st().panels.M5).toMatchObject({ status: "done", stale: false });
    expect(st().panels.M1.status).toBe("idle");
    const firstValid = base.setups.find((x) => x.status === "valid");
    expect(st().panels.M5.chosenSetupId).toBe(firstValid?.id);
    expect(useAnnotationStore.getState().annotations.length).toBe(firstValid?.annotations.length);
  });

  it("scan all skips unsupported charts and limits requests in flight to 2", async () => {
    const d = deferredSource();
    const all = scanAll(d.source);
    await flush();
    expect(st().panels.H4.status).toBe("unsupported");
    expect(st().panels.H1.status).toBe("unsupported");
    expect(d.pending).toHaveLength(MAX_IN_FLIGHT);
    expect(d.pending.map((x) => x.req.timeframe)).toEqual(["M15", "M5"]); // panel order, top-down
    d.pending[0]!.resolve(resultFor("M15")); // frees a slot
    await flush();
    expect(d.pending).toHaveLength(3);
    expect(st().panels.M15.status).toBe("done"); // finishes independently
    expect(st().panels.M5.status).toBe("running");
    d.pending[1]!.resolve(resultFor("M5"));
    d.pending[2]!.resolve(resultFor("M1"));
    await all;
    expect(d.peak()).toBe(MAX_IN_FLIGHT);
    expect(["M1", "M5", "M15"].map((tf) => st().panels[tf as Timeframe].status)).toEqual(["done", "done", "done"]);
  });

  it("a new scan on a chart aborts its previous one and drops the late response", async () => {
    const d = deferredSource();
    const first = scanPanel("M5", d.source);
    await flush();
    const second = scanPanel("M5", d.source);
    await flush();
    expect(d.pending[0]!.signal?.aborted).toBe(true);
    d.pending[1]!.resolve({ ...resultFor("M5"), scan_id: "second" });
    await Promise.all([first, second]);
    expect(st().panels.M5.result?.scan_id).toBe("second");
  });

  it("drops a response that arrives after an abort without a reject", async () => {
    const d = deferredSource();
    const p = scanPanel("M5", d.source);
    await flush();
    const req = d.pending[0]!;
    cancelAll();
    req.resolve({ ...resultFor("M5"), scan_id: "late" }); // resolves anyway
    await p;
    expect(st().panels.M5.result).toBeUndefined();
  });

  it("changing a parameter marks results stale (kept) and cancels what is running", async () => {
    const d = deferredSource();
    const done = scanPanel("M5", d.source);
    await flush();
    d.pending[0]!.resolve(resultFor("M5"));
    await done;
    const running = scanPanel("M1", d.source);
    await flush();
    const key = strategies[0]!.params.find((p) => p.type === "boolean")!.key;
    st().setParam(key, !st().params[key]);
    expect(st().panels.M5).toMatchObject({ status: "done", stale: true });
    expect(st().panels.M5.result).toBeDefined();
    expect(st().panels.M1.status).toBe("idle"); // nothing to keep
    expect(d.pending[1]!.signal?.aborted).toBe(true);
    await running;
  });

  it("range and pair changes also mark results stale", async () => {
    const d = deferredSource();
    const p = scanPanel("M5", d.source);
    await flush();
    d.pending[0]!.resolve(resultFor("M5"));
    await p;
    st().setRange({ from: "2025-06-10", to: "2025-06-30" });
    expect(st().panels.M5.stale).toBe(true);
    st().reset();
    st().setBounds({ first: Date.parse("2025-01-01T00:00:00Z") / 1000, last: Date.parse("2025-06-30T12:00:00Z") / 1000 });
    st().setCatalog(strategies);
    st().setRange({ from: "2025-06-01", to: "2025-06-30" });
    const q = scanPanel("M5", d.source);
    await flush();
    d.pending[1]!.resolve(resultFor("M5"));
    await q;
    useViewStore.setState({ pair: "GBP_USD" });
    expect(st().panels.M5.stale).toBe(true);
  });

  it("reports server failures with what to do, and recovers on rescan", async () => {
    const d = deferredSource();
    const p = scanPanel("M5", d.source);
    await flush();
    d.pending[0]!.reject(new ApiError("network", "Failed to fetch"));
    await p;
    expect(st().panels.M5.status).toBe("error");
    expect(st().panels.M5.error).toMatch(/Check that the backend is running, then scan again/);
    const again = scanPanel("M5", d.source);
    await flush();
    d.pending[1]!.resolve(resultFor("M5"));
    await again;
    expect(st().panels.M5.status).toBe("done");
  });

  it("maps error kinds to actionable messages", () => {
    expect(scanErrorMessage(new ApiError("timeout", "x"))).toMatch(/Narrow the date range/);
    expect(scanErrorMessage(new ApiError("http", "Param \"x\" must be >= 5", 422))).toMatch(/Scan rejected: .*Adjust/);
    expect(scanErrorMessage(new ApiError("http", "boom", 500))).toMatch(/Try again/);
    expect(scanErrorMessage(new Error("?"))).toMatch(/unexpectedly/);
  });

  it("switching strategy marks charts unsupported or idle and keeps other results stale", async () => {
    const d = deferredSource();
    const second = { ...strategies[0]!, id: "other", name: "Other", supported_timeframes: ["M1" as const] };
    st().setCatalog([...strategies, second]);
    const p = scanPanel("M5", d.source);
    await flush();
    d.pending[0]!.resolve(resultFor("M5"));
    await p;
    st().selectStrategy("other");
    expect(st().panels.M5.status).toBe("unsupported");
    expect(st().panels.M5.result).toBeUndefined();
    expect(st().panels.M15.reason).toMatch(/Not supported by Other\. Scan M1 instead/);
    expect(st().panels.M1.status).toBe("idle");
    st().selectStrategy("orb");
    expect(st().panels.M5.status).toBe("idle");
    expect(st().panels.H1.status).toBe("unsupported");
  });

  it("scanPanel on an unsupported chart does nothing", async () => {
    const d = deferredSource();
    await scanPanel("H1", d.source);
    expect(d.pending).toHaveLength(0);
    expect(st().panels.H1.status).toBe("unsupported");
  });
});