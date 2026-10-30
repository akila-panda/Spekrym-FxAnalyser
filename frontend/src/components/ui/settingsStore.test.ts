import { act } from "@testing-library/react";
import { loadSettings, useSettingsStore } from "./settingsStore";

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  act(() => {
    useSettingsStore.getState().setTheme("system");
    useSettingsStore.getState().setDensity("compact");
  });
});

describe("DX7 settings", () => {
  it("sets and clears data-theme", () => {
    act(() => useSettingsStore.getState().setTheme("light"));
    expect(root.getAttribute("data-theme")).toBe("light");
    act(() => useSettingsStore.getState().setTheme("dark"));
    expect(root.getAttribute("data-theme")).toBe("dark");
    act(() => useSettingsStore.getState().setTheme("system"));
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("sets data-density only for comfortable", () => {
    act(() => useSettingsStore.getState().setDensity("comfortable"));
    expect(root.getAttribute("data-density")).toBe("comfortable");
    act(() => useSettingsStore.getState().setDensity("compact"));
    expect(root.hasAttribute("data-density")).toBe(false);
  });

  it("persists and ignores corrupt storage", () => {
    act(() => useSettingsStore.getState().setTheme("dark"));
    expect(loadSettings().theme).toBe("dark");
    localStorage.setItem("spekrym.ui.v1", "{nope");
    expect(loadSettings()).toEqual({ theme: "system", density: "compact" });
  });

  it("bumps epoch on theme change so charts re-read tokens", () => {
    const before = useSettingsStore.getState().epoch;
    act(() => useSettingsStore.getState().setTheme("light"));
    expect(useSettingsStore.getState().epoch).toBe(before + 1);
  });
});