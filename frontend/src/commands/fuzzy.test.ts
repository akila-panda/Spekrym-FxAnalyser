import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyMatch, fuzzyScore } from "./fuzzy";

describe("DX11 fuzzy", () => {
  it("empty query matches everything with score 0", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, positions: [] });
    expect(fuzzyMatch("   ", "x")).toEqual({ score: 0, positions: [] });
  });

  it("matches a case-insensitive subsequence and reports positions", () => {
    expect(fuzzyMatch("PO", "Pop out charts")?.positions).toEqual([0, 1]);
    expect(fuzzyMatch("poc", "Pop out charts")).not.toBeNull();
    expect(fuzzyMatch("xyz", "Pop out charts")).toBeNull();
    expect(fuzzyMatch("sp", "ps")).toBeNull();
  });

  it("ignores spaces in the query", () => {
    expect(fuzzyMatch("pop out", "Pop out charts")).not.toBeNull();
    expect(fuzzyMatch("popout", "Pop out charts")).not.toBeNull();
  });

  it("ranks prefix, consecutive and word-start matches above scattered ones", () => {
    const prefix = fuzzyScore("pa", "Pair: GBP/USD")!;
    const scattered = fuzzyScore("pa", "Switch pair")!;
    expect(prefix).toBeGreaterThan(scattered);
    expect(fuzzyScore("sh", "Show shortcuts")!).toBeGreaterThan(fuzzyScore("sh", "Mode: Scan history")!);
  });

  it("filters, sorts best first and keeps the original order on ties", () => {
    const items = ["Mode: Review", "Pop out stack", "Pop out charts", "Toggle Linked"];
    expect(fuzzyFilter(items, "pop", (s) => s)).toEqual(["Pop out stack", "Pop out charts"]);
    expect(fuzzyFilter(items, "", (s) => s)).toEqual(items);
    expect(fuzzyFilter(items, "", (s) => s, 2)).toEqual(items.slice(0, 2));
    expect(fuzzyFilter(items, "zzz", (s) => s)).toEqual([]);
  });
});