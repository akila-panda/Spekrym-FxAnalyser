import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { detectAll } from "@/desk/detect";
import { rulesVersion } from "@/desk/lib/hash";
import { deepCandles } from "@/desk/mock/deepMock";
import { snapshotsForDay } from "@/desk/prepare/snapshotStore";
import { DEFAULTS } from "./defaults";
import { MethodologyBody } from "./MethodologyEditor";
import { DEFAULT_RV, activeMethodology, parseMethodology, resolveRulesVersion, useMethodologyStore } from "./methodologyStore";
import { buildCfg, cleanOverrides, diffRows, flatten, paramRows, rulesVersionOf, validateConfig, validateParam } from "./params";

const reset = () => { useMethodologyStore.getState().clearAll(); localStorage.clear(); };

describe("params", () => {
  it("no overrides ⇒ exactly the default rulesVersion; DEFAULTS is never mutated", () => {
    expect(rulesVersionOf({})).toBe(rulesVersion(DEFAULTS));
    const before = JSON.stringify(DEFAULTS);
    buildCfg({ "fvg.minAtr": 0.5, "reference.sessions.london.0": 8, "structure.breakRule": "wick" });
    expect(JSON.stringify(DEFAULTS)).toBe(before);
  });
  it("each distinct override set has its own version; same set ⇒ same version", () => {
    const a = rulesVersionOf({ "fvg.minAtr": 0.5 });
    expect(a).not.toBe(DEFAULT_RV);
    expect(rulesVersionOf({ "fvg.minAtr": 0.5 })).toBe(a);
    expect(rulesVersionOf({ "fvg.minAtr": 0.6 })).not.toBe(a);
  });
  it("applies nested, record and array paths", () => {
    const c = buildCfg({ "levels.tfWeight.D": 0.5, "reference.sessions.ny.1": 22, "fvg.fillRule": "close", "reference.sessionsDst": false });
    expect(c.levels.tfWeight.D).toBe(0.5);
    expect(c.reference.sessions.ny).toEqual([12, 22]);
    expect(c.fvg.fillRule).toBe("close");
    expect(c.reference.sessionsDst).toBe(false);
  });
  it("covers every leaf except presentation constants", () => {
    const paths = flatten(DEFAULTS).map((l) => l.path);
    expect(paths).toContain("priceAction.tlAtr");
    expect(paths).toContain("swingN.W");
    expect(paths.some((p) => p.startsWith("caps") || p === "relevanceAtr")).toBe(false);
  });
  it("validates type, range, integers, enums, booleans, unknown", () => {
    expect(validateParam("fvg.minAtr", 0.5)).toBeNull();
    expect(validateParam("fvg.minAtr", 0)).toMatch(/between/);
    expect(validateParam("fvg.minAtr", NaN)).toMatch(/number/);
    expect(validateParam("levels.reactBars", 2.5)).toMatch(/whole/);
    expect(validateParam("structure.breakRule", "mid")).toMatch(/Choose/);
    expect(validateParam("reference.sessionsDst", "yes")).toMatch(/on or off/);
    expect(validateParam("nope.x", 1)).toMatch(/Unknown/);
    expect(validateParam("levels.tfWeight.D", 1.5)).toMatch(/between/);
  });
  it("cross-parameter rules", () => {
    expect(validateConfig({ "supplyDemand.baseBarsMin": 9 })).toHaveLength(1);
    expect(validateConfig({ "reference.sessions.asia.0": 9 })).toHaveLength(1);
    expect(validateConfig({})).toEqual([]);
  });
  it("cleanOverrides drops invalid, unknown and default-equal entries", () => {
    expect(cleanOverrides({ "fvg.minAtr": 0.25, "fvg.nearestN": 3, bad: 1, "levels.reactBars": 2.5 })).toEqual({ "fvg.nearestN": 3 });
  });
  it("diff lists only changes", () => {
    expect(diffRows({})).toEqual([]);
    expect(diffRows({ "fvg.nearestN": 3 }).map((r) => [r.path, r.def, r.value])).toEqual([["fvg.nearestN", 5, 3]]);
    expect(paramRows({}).every((r) => !r.changed)).toBe(true);
  });
});

describe("detection uses the methodology", () => {
  const candles = deepCandles("EUR_USD", "H1");
  const run = (o: Record<string, number | string | boolean>) =>
    detectAll({ candles, pair: "EUR_USD", tf: "H1", asOf: Infinity, dataKind: "sample", dataVersion: "t" }, buildCfg(o));
  it("a parameter change alters objects and stamps the new rulesVersion on them", () => {
    const base = run({});
    const tight = run({ "fvg.minAtr": 2 });
    expect(tight.objects.filter((o) => o.type === "fvg").length).toBeLessThan(base.objects.filter((o) => o.type === "fvg").length);
    expect(base.objects[0]!.provenance.rulesVersion).toBe(DEFAULT_RV);
    expect(tight.objects[0]!.provenance.rulesVersion).toBe(rulesVersionOf({ "fvg.minAtr": 2 }));
  });
  it("ids are stable across methodology changes (price/params excluded from the id)", () => {
    const a = new Set(run({}).objects.filter((o) => o.type === "swing").map((o) => o.id));
    const b = run({ "fvg.minAtr": 2 }).objects.filter((o) => o.type === "swing").map((o) => o.id);
    expect(b.every((id) => a.has(id))).toBe(true);
  });
});

describe("store", () => {
  beforeEach(reset);
  it("apply records one version per distinct config; activate/reset move the active one; history is kept", () => {
    const s = () => useMethodologyStore.getState();
    const r1 = s().apply({ "fvg.minAtr": 0.5 }, "wider fvg", 100);
    expect(r1).toMatchObject({ ok: true, changed: true });
    expect(activeMethodology().rulesVersion).toBe(rulesVersionOf({ "fvg.minAtr": 0.5 }));
    s().apply({ "fvg.minAtr": 0.5 }, "again", 200);
    expect(s().versions).toHaveLength(1);
    s().apply({ "fvg.minAtr": 0.7 }, "b", 300);
    expect(s().versions).toHaveLength(2);
    s().reset();
    expect(activeMethodology().isDefault).toBe(true);
    expect(s().versions).toHaveLength(2);
    expect(s().activate(rulesVersionOf({ "fvg.minAtr": 0.5 }))).toBe(true);
    expect(s().active).toEqual({ "fvg.minAtr": 0.5 });
    expect(s().activate("rzzz")).toBe(false);
  });
  it("rejects invalid sets without changing anything", () => {
    const r = useMethodologyStore.getState().apply({ "fvg.minAtr": -1 });
    expect(r.ok).toBe(false);
    expect(useMethodologyStore.getState().active).toEqual({});
    expect(useMethodologyStore.getState().apply({ "supplyDemand.baseBarsMin": 9 }).ok).toBe(false);
  });
  it("old rulesVersions stay resolvable; snapshots keep theirs", () => {
    const old = rulesVersionOf({ "fvg.minAtr": 0.5 });
    useMethodologyStore.getState().apply({ "fvg.minAtr": 0.5 }, "v", 1);
    useMethodologyStore.getState().apply({ "fvg.minAtr": 0.9 }, "w", 2);
    expect(resolveRulesVersion(old)).toEqual({ "fvg.minAtr": 0.5 });
    expect(resolveRulesVersion(DEFAULT_RV)).toEqual({});
    expect(resolveRulesVersion("rnone")).toBeNull();
    expect(snapshotsForDay([], "EUR_USD", "2025-01-01")).toEqual([]);
  });
  it("persists at spekrym.desk.methodology.v1 and survives corrupt input", () => {
    useMethodologyStore.getState().apply({ "fvg.minAtr": 0.5 }, "v", 1);
    const raw = JSON.parse(localStorage.getItem("spekrym.desk.methodology.v1")!);
    expect(raw.data.active).toEqual({ "fvg.minAtr": 0.5 });
    expect(parseMethodology("junk")).toEqual({ active: {}, versions: [] });
    expect(parseMethodology({ active: { "fvg.minAtr": -5, x: 1 }, versions: [{ overrides: { "supplyDemand.baseBarsMin": 9 } }, 4] })).toEqual({ active: {}, versions: [] });
  });
});

describe("MethodologyBody", () => {
  beforeEach(reset);
  it("edit → inline validation → apply as a new version → diff → reset", async () => {
    const u = userEvent.setup();
    render(<MethodologyBody />);
    expect(screen.getByText(DEFAULT_RV)).toBeTruthy();
    const apply = screen.getByRole("button", { name: "Apply as new version" });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    for (const s of screen.getAllByText(/Supply & demand|FVG/)) if (s.tagName === "SUMMARY") await u.click(s);
    const input = screen.getByLabelText(/^minAtr/);
    await u.clear(input);
    await u.type(input, "-1");
    expect((await screen.findAllByRole("alert"))[0]!.textContent).toMatch(/between/);
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    await u.clear(input);
    await u.type(input, "0.5");
    expect((apply as HTMLButtonElement).disabled).toBe(false);
    await u.click(apply);
    expect(useMethodologyStore.getState().active).toEqual({ "fvg.minAtr": 0.5 });
    expect(screen.getByRole("region", { name: "Diff vs defaults" }).textContent).toMatch(/fvg\.minAtr/);
    await u.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(useMethodologyStore.getState().active).toEqual({});
    expect(useMethodologyStore.getState().versions).toHaveLength(1);
  });
});