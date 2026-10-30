import type { ParamDef } from "@/types";
import { formatParamValue, groupOpen, summarizeParams } from "./paramSummary";

const defs = [
  { key: "range", label: "Range", type: "integer", default: 15, unit: "m" },
  { key: "hold", label: "Hold", type: "integer", default: 180, unit: "min" },
  { key: "rr", label: "Reward", type: "number", default: 1.5, unit: "R" },
  { key: "mode", label: "Mode", type: "select", default: "a", options: ["a", "b"] },
  { key: "flt", label: "Filter", type: "boolean", default: true },
] as unknown as ParamDef[];

const base = { range: 15, hold: 180, rr: 1.5, mode: "a", flt: true };

describe("DX6 paramSummary", () => {
  it("formats values with units", () => {
    expect(formatParamValue(defs[0]!, 15)).toBe("15m");
    expect(formatParamValue(defs[1]!, 180)).toBe("180 min");
    expect(formatParamValue(defs[4]!, false)).toBe("Filter: off");
  });

  it("limits parts and counts the rest", () => {
    const m = summarizeParams(defs, base, 3);
    expect(m.parts.map((p) => p.key)).toEqual(["range", "hold", "rr"]);
    expect(m.more).toBe(2);
    expect(m.changed).toBe(0);
  });

  it("always shows edited values, in definition order", () => {
    const m = summarizeParams(defs, { ...base, flt: false, mode: "b" }, 2);
    expect(m.parts.map((p) => p.key)).toEqual(["mode", "flt"]);
    expect(m.parts.every((p) => p.changed)).toBe(true);
    expect(m.changed).toBe(2);
  });

  it("opens groups before the first scan and respects an explicit choice", () => {
    expect(groupOpen(null, false)).toBe(true);
    expect(groupOpen(null, true)).toBe(false);
    expect(groupOpen(true, true)).toBe(true);
    expect(groupOpen(false, false)).toBe(false);
  });
});