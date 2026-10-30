import { beforeEach, describe, expect, it } from "vitest";
import { usePanelStore } from "@/panels/panelStore";
import { useModeStore } from "./modeStore";
import { AUTO_COLLAPSE_MS, DEFAULT_MODE, isMode, MODE_PRESETS, MODES, shouldAutoCollapse } from "./modes";
import { useRailStore } from "./railStore";

describe("DX10 mode presets", () => {
  it("has one preset per mode and validates mode names", () => {
    expect(MODES).toEqual(["scan", "investigate", "review"]);
    expect(Object.keys(MODE_PRESETS).sort()).toEqual([...MODES].sort());
    expect(DEFAULT_MODE).toBe("scan");
    expect(isMode("review")).toBe(true);
    expect(isMode("spiral")).toBe(false);
    expect(isMode(null)).toBe(false);
  });

  it("auto-collapse applies only in Investigate and only when enabled", () => {
    expect(shouldAutoCollapse("investigate", true)).toBe(true);
    expect(shouldAutoCollapse("investigate", false)).toBe(false);
    expect(shouldAutoCollapse("scan", true)).toBe(false);
    expect(shouldAutoCollapse("review", true)).toBe(false);
    expect(AUTO_COLLAPSE_MS).toBe(1500);
  });
});

describe("DX10 mode store", () => {
  beforeEach(() => {
    useModeStore.setState({ mode: "scan", leftCollapsed: false, rightCollapsed: false });
    usePanelStore.getState().setLayout("grid");
    useRailStore.getState().reset();
  });

  it("Investigate: stack, left rail collapsed, Why it qualified open", () => {
    useModeStore.getState().setMode("investigate");
    expect(usePanelStore.getState().layout).toBe("stack");
    expect(useRailStore.getState().open).toBe("why");
    expect(useModeStore.getState()).toMatchObject({ mode: "investigate", leftCollapsed: true, rightCollapsed: false });
  });

  it("Review: focus layout, Conditions open", () => {
    useModeStore.getState().setMode("review");
    expect(usePanelStore.getState().layout).toBe("focus");
    expect(useRailStore.getState().open).toBe("conditions");
    expect(useModeStore.getState().leftCollapsed).toBe(true);
  });

  it("Scan: grid, left rail open, no section open", () => {
    useModeStore.getState().setMode("review");
    useModeStore.getState().setMode("scan");
    expect(usePanelStore.getState().layout).toBe("grid");
    expect(useRailStore.getState().open).toBeNull();
    expect(useModeStore.getState()).toMatchObject({ mode: "scan", leftCollapsed: false, rightCollapsed: false });
  });

  it("rails toggle and collapse independently of the mode", () => {
    useModeStore.getState().toggleLeft();
    expect(useModeStore.getState().leftCollapsed).toBe(true);
    useModeStore.getState().toggleRight();
    useModeStore.getState().toggleLeft();
    expect(useModeStore.getState()).toMatchObject({ leftCollapsed: false, rightCollapsed: true });
    useModeStore.getState().collapseRails();
    expect(useModeStore.getState()).toMatchObject({ leftCollapsed: true, rightCollapsed: true });
  });

  it("auto-collapse is off by default and persists locally", () => {
    expect(useModeStore.getState().autoCollapse).toBe(false);
    useModeStore.getState().setAutoCollapse(true);
    expect(localStorage.getItem("spekrym.autocollapse.v1")).toBe("1");
    useModeStore.getState().setAutoCollapse(false);
    expect(localStorage.getItem("spekrym.autocollapse.v1")).toBe("0");
  });
});