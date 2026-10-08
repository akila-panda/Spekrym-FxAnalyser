import { describe, expect, it } from "vitest";
import { filterByClass, signalClassOf } from "./filterStrategies";
import type { StrategyDef } from "@/types";

const s = (id: string, signal_class?: StrategyDef["signal_class"]): StrategyDef => ({
  id, name: id, description: "", display_tz: "UTC",
  supported_timeframes: ["M5"], context_timeframes: [], params: [], signal_class,
});
const list = [s("a"), s("b", "hybrid"), s("c", "indicator"), s("d", "price_only")];

describe("filterStrategies", () => {
  it("treats a missing class as price_only", () => {
    expect(signalClassOf(s("x"))).toBe("price_only");
  });

  it("returns everything for 'all'", () => {
    expect(filterByClass(list, "all").map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("filters price_only (including untagged)", () => {
    expect(filterByClass(list, "price_only").map((x) => x.id)).toEqual(["a", "d"]);
  });

  it("filters hybrid and indicator", () => {
    expect(filterByClass(list, "hybrid").map((x) => x.id)).toEqual(["b"]);
    expect(filterByClass(list, "indicator").map((x) => x.id)).toEqual(["c"]);
  });
});
