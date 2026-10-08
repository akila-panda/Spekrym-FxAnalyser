import { beforeEach, describe, expect, it } from "vitest";
import { loadPresets, removePreset, savePreset } from "./presets";

describe("presets storage", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty", () => {
    expect(loadPresets()).toEqual([]);
  });

  it("saves and reloads a preset", () => {
    savePreset("London ORB", { pair: "GBP_USD", strategy: "orb" });
    expect(loadPresets()).toEqual([{ name: "London ORB", state: { pair: "GBP_USD", strategy: "orb" } }]);
  });

  it("replaces a preset with the same name and keeps the list sorted", () => {
    savePreset("b", { pair: "EUR_USD" });
    savePreset("a", { pair: "USD_JPY" });
    savePreset("b", { pair: "GBP_USD" });
    const list = loadPresets();
    expect(list.map((p) => p.name)).toEqual(["a", "b"]);
    expect(list.find((p) => p.name === "b")?.state).toEqual({ pair: "GBP_USD" });
  });

  it("ignores a blank name", () => {
    savePreset("   ", { pair: "EUR_USD" });
    expect(loadPresets()).toEqual([]);
  });

  it("removes a preset", () => {
    savePreset("x", { pair: "EUR_USD" });
    expect(removePreset("x")).toEqual([]);
    expect(loadPresets()).toEqual([]);
  });

  it("returns [] on corrupt storage", () => {
    localStorage.setItem("spekrym.presets.v1", "{not json");
    expect(loadPresets()).toEqual([]);
  });
});
