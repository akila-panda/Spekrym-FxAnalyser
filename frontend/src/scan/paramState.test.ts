import { parseStrategies } from "@/types";
import strategiesFixture from "@/test/fixtures/strategies.json";
import { changedKeys, defaultValues, resetOne, toRequestParams, validateAll, validateParam } from "./paramState";

const orb = parseStrategies(strategiesFixture)[0]!;
const p = (key: string) => orb.params.find((x) => x.key === key)!;
const numeric = orb.params.find((x) => x.type === "integer" && x.min !== undefined && x.max !== undefined)!;

describe("paramState", () => {
  it("builds defaults from the definitions and validates clean", () => {
    const v = defaultValues(orb.params);
    expect(Object.keys(v)).toEqual(orb.params.map((x) => x.key));
    expect(validateAll(orb.params, v)).toEqual({});
    expect(changedKeys(orb.params, v).size).toBe(0);
  });

  it("validates numeric min and max with a message that says what to do", () => {
    if (numeric.type !== "integer") throw new Error("fixture needs an integer param");
    expect(validateParam(numeric, (numeric.max ?? 0) + 1)).toMatch(/must be between/);
    expect(validateParam(numeric, numeric.default)).toBeNull();
  });

  it("rejects empty and non-numeric text, and fractions for integers", () => {
    expect(validateParam(numeric, "")).toMatch(/needs a number/);
    expect(validateParam(numeric, "abc")).toMatch(/needs a number/);
    expect(validateParam(numeric, 60.5)).toMatch(/whole number/);
  });

  it("validates HH:MM", () => {
    const t = p("session_open");
    expect(validateParam(t, "07:00")).toBeNull();
    expect(validateParam(t, "25:00")).toMatch(/HH:MM/);
    expect(validateParam(t, "7:00")).toMatch(/HH:MM/);
  });

  it("validates select options and booleans", () => {
    const sel = { key: "m", label: "Mode", type: "select" as const, default: "a", options: ["a", "b"] };
    expect(validateParam(sel, "b")).toBeNull();
    expect(validateParam(sel, "z")).toMatch(/Choose one of/);
    const bool = { key: "f", label: "Flag", type: "boolean" as const, default: true };
    expect(validateParam(bool, "yes")).toMatch(/on or off/);
  });

  it("flags changed-from-default and resets one or all", () => {
    const v = { ...defaultValues(orb.params), [numeric.key]: Number(numeric.default) + 1 };
    expect([...changedKeys(orb.params, v)]).toEqual([numeric.key]);
    expect(changedKeys(orb.params, resetOne(orb.params, v, numeric.key)).size).toBe(0);
    // typed text equal to the default is not a change
    expect(changedKeys(orb.params, { ...v, [numeric.key]: String(numeric.default) }).size).toBe(0);
  });

  it("converts numeric text to numbers for the request", () => {
    const v = { ...defaultValues(orb.params), [numeric.key]: "45" };
    expect(toRequestParams(orb.params, v)[numeric.key]).toBe(45);
  });
});