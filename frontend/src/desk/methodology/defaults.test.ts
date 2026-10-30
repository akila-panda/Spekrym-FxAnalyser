import { describe, expect, it } from "vitest";
import { rulesVersion } from "@/desk/lib/hash";
import { DEFAULTS, defaultMethodology } from "./defaults";

describe("methodology defaults", () => {
  it("defaultMethodology stamps a rulesVersion matching DEFAULTS", () => {
    const m = defaultMethodology();
    expect(m.version).toBe(1);
    expect(m.rulesVersion).toBe(rulesVersion(DEFAULTS));
  });

  it("a param change yields a different rulesVersion", () => {
    const base = rulesVersion(DEFAULTS);
    const changed = rulesVersion({ ...DEFAULTS, fvg: { ...DEFAULTS.fvg, minAtr: 0.5 } });
    expect(changed).not.toBe(base);
  });

  it("carries the key detector thresholds (units = ATR)", () => {
    expect(DEFAULTS.atrPeriod).toBe(14);
    expect(DEFAULTS.swingN.W).toBe(2);
    expect(DEFAULTS.swingN.H1).toBe(3);
    expect(DEFAULTS.fvg.minAtr).toBe(0.25);
    expect(DEFAULTS.liquidity.lookbackDays).toBe(5);
    expect(DEFAULTS.caps.minimalTotal).toBe(3);
  });
});
