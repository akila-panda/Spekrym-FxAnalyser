import bounds from "@/test/fixtures/bounds.json";
import candles from "@/test/fixtures/candles.json";
import scan from "@/test/fixtures/scanResult.json";
import strategies from "@/test/fixtures/strategies.json";
import { parseBackendTs } from "@/lib/time";
import { ContractError, parseBounds, parseCandles, parseScanResult, parseStrategies } from "./schemas";
import { isKnownRole } from "./annotations";

// Fixtures are real output of the FastAPI backend (api/).
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
type Mutable = { setups: { annotations: Record<string, unknown>[]; steps: unknown[]; outcome: unknown; focus: Record<string, string> }[] };

function fails(fn: () => unknown): ContractError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ContractError);
    return e as ContractError;
  }
  throw new Error("expected parse to fail");
}

describe("ScanResult", () => {
  it("accepts a real backend result and converts timestamps to UTC seconds", () => {
    const r = parseScanResult(scan);
    expect(r.timeframe).toBe("M1");
    expect(r.setups).toHaveLength(2);
    const valid = r.setups.find((s) => s.status === "valid");
    expect(valid?.outcome?.exit_reason).toBe("tp");
    const trade = valid?.annotations.find((a) => a.kind === "trade");
    expect(trade?.kind).toBe("trade");
    if (trade?.kind === "trade") {
      expect(trade.t0).toBe(parseBackendTs("2025-05-07 07:16:00+00:00"));
      expect(trade.direction).toBe("long");
      expect(trade.exit_time).toBeGreaterThan(trade.t0);
    }
    expect(valid && valid.focus.to > valid.focus.from).toBe(true);
    expect(r.summary.cost_pips_assumed).toBe(1.6);
  });

  it("turns backend nulls into absent optional fields", () => {
    const r = parseScanResult(scan);
    const rejected = r.setups.find((s) => s.status === "rejected");
    expect(rejected?.outcome).toBeUndefined();
    expect(rejected?.direction).toBeUndefined();
  });

  it("rejects a wrong-typed timestamp with a readable path", () => {
    const bad = clone(scan) as unknown as Mutable;
    bad.setups[0]!.annotations[0]!.t0 = 12345;
    const e = fails(() => parseScanResult(bad));
    expect(e.message).toMatch(/^scan: setups\[0\]\.annotations\[0\]\.t0:/);
  });

  it("rejects a zone missing its price bounds", () => {
    const bad = clone(scan) as unknown as Mutable;
    const zone = bad.setups[0]!.annotations.find((a) => a["kind"] === "zone")!;
    zone["p_high"] = null;
    const e = fails(() => parseScanResult(bad));
    expect(e.issues.join(" ")).toContain("p_high");
  });

  it("rejects an annotation whose step is not in the setup", () => {
    const bad = clone(scan) as unknown as Mutable;
    bad.setups[0]!.annotations[0]!["step"] = 9;
    expect(fails(() => parseScanResult(bad)).message).toContain("step 9 is not in setup.steps");
  });

  it("rejects a valid setup with no outcome", () => {
    const bad = clone(scan) as unknown as Mutable;
    const i = (bad.setups as { outcome: unknown }[]).findIndex((s) => s.outcome);
    bad.setups[i]!.outcome = null;
    expect(fails(() => parseScanResult(bad)).message).toContain(`setups[${i}].outcome`);
  });

  it("rejects an unknown annotation kind", () => {
    const bad = clone(scan) as unknown as Mutable;
    bad.setups[0]!.annotations[0]!["kind"] = "hologram";
    expect(fails(() => parseScanResult(bad)).message).toContain("annotations[0].kind");
  });

  it("accepts unknown roles (renderer falls back to tone) and unknown tones become neutral", () => {
    const odd = clone(scan) as unknown as Mutable;
    odd.setups[0]!.annotations[0]!["role"] = "brand_new_role";
    odd.setups[0]!.annotations[0]!["tone"] = "purple";
    const a = parseScanResult(odd).setups[0]!.annotations[0]!;
    expect(a.role).toBe("brand_new_role");
    expect(isKnownRole(a.role)).toBe(false);
    expect(a.tone).toBe("neutral");
    expect(isKnownRole("liquidity")).toBe(true);
  });

  it("error list is capped and names the label", () => {
    const e = fails(() => parseScanResult({}));
    expect(e.label).toBe("scan");
    expect(e.issues.length).toBeLessThanOrEqual(5);
  });
});

describe("other responses", () => {
  it("parses candles into the Candle shape", () => {
    const r = parseCandles(candles);
    expect(r.candles).toHaveLength(3);
    const c = r.candles[0]!;
    expect(Object.keys(c).sort()).toEqual(["close", "high", "low", "open", "time", "volume"]);
    expect(c.time).toBe(parseBackendTs("2025-05-07 07:00:00+00:00"));
    expect(r.candles[1]!.time - c.time).toBe(900);
  });

  it("parses bounds for all five timeframes", () => {
    const r = parseBounds(bounds);
    expect(r.bounds.H4.first).toBe(parseBackendTs("2025-05-06 04:00:00+00:00"));
    expect(r.bounds.M1.last).toBeGreaterThan(r.bounds.M1.first ?? 0);
  });

  it("parses the strategy catalog and checks param defaults", () => {
    const list = parseStrategies(strategies);
    const orb = list[0]!;
    expect(orb.supported_timeframes).toEqual(["M1", "M5", "M15"]);
    expect(orb.params.find((p) => p.key === "mode")).toMatchObject({ type: "select", default: "breakout" });
    const bad = clone(strategies) as { params: { key: string; options?: string[]; default?: unknown }[] }[];
    const mode = bad[0]!.params.find((p) => p.key === "mode")!;
    mode.default = "nope";
    expect(fails(() => parseStrategies(bad)).message).toContain("default is not in options");
    const bad2 = clone(strategies) as { params: { key: string; default?: unknown }[] }[];
    bad2[0]!.params.find((p) => p.key === "session_open")!.default = "7am";
    expect(fails(() => parseStrategies(bad2)).message).toContain("expected HH:MM");
  });
});