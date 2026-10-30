import { MAIN, parseRole, roleEquals, roleParam, withRoleParam } from "./role";

describe("W1 parseRole", () => {
  it("defaults to main", () => {
    expect(parseRole("")).toEqual(MAIN);
    expect(parseRole("?pair=EUR_USD")).toEqual(MAIN);
    expect(parseRole("?window=main")).toEqual(MAIN);
  });
  it("parses simple roles", () => {
    for (const k of ["charts", "setups", "stack", "analytics", "journal"] as const) {
      expect(parseRole(`?window=${k}`)).toEqual({ kind: k });
    }
    expect(parseRole("window=CHARTS")).toEqual({ kind: "charts" });
  });
  it("parses chart:<tf>", () => {
    expect(parseRole("?window=chart:M5")).toEqual({ kind: "chart", tf: "M5" });
    expect(parseRole("?window=chart%3Am15")).toEqual({ kind: "chart", tf: "M15" });
    expect(parseRole("?window=chart:D")).toEqual({ kind: "chart", tf: "D" });
    expect(parseRole("?window=chart:w")).toEqual({ kind: "chart", tf: "W" });
  });
  it("falls back to main on invalid", () => {
    expect(parseRole("?window=bogus")).toEqual(MAIN);
    expect(parseRole("?window=chart:")).toEqual(MAIN);
    expect(parseRole("?window=chart:X9")).toEqual(MAIN);
    expect(parseRole("?window=")).toEqual(MAIN);
  });
});

describe("W1 helpers", () => {
  it("roleParam round-trips", () => {
    for (const s of ["charts", "setups", "stack", "chart:H1"]) {
      expect(roleParam(parseRole(`?window=${s}`))).toBe(s);
    }
    expect(roleParam(MAIN)).toBeNull();
  });
  it("roleEquals", () => {
    expect(roleEquals({ kind: "chart", tf: "M5" }, { kind: "chart", tf: "M5" })).toBe(true);
    expect(roleEquals({ kind: "chart", tf: "M5" }, { kind: "chart", tf: "H1" })).toBe(false);
    expect(roleEquals({ kind: "charts" }, { kind: "setups" })).toBe(false);
  });
  it("withRoleParam preserves the role through URL rewrites", () => {
    expect(withRoleParam("pair=EUR_USD", "?window=charts")).toBe("pair=EUR_USD&window=charts");
    expect(parseRole(withRoleParam("pair=EUR_USD", "?window=chart:M5"))).toEqual({ kind: "chart", tf: "M5" });
    expect(withRoleParam("pair=EUR_USD", "?pair=GBP_USD")).toBe("pair=EUR_USD");
    expect(withRoleParam("", "?window=stack")).toBe("window=stack");
  });
});