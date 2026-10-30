import { beforeEach, describe, expect, it } from "vitest";
import { deskKey } from "@/desk/lib/storage";
import { parsePrefs, useDeskStore } from "./deskStore";
import { useDeskUiStore } from "./deskUiStore";

describe("deskStore prefs", () => {
  beforeEach(() => {
    useDeskStore.setState({ app: "scan", area: "my", workflow: "prepare", complexity: "standard", layoutByWorkflow: {}, focusSets: {} });
    useDeskUiStore.setState({ focusOn: false, simplifyPrev: null, selectedObjectId: null, asOf: "latest" });
  });

  it("parsePrefs falls back to defaults on garbage", () => {
    expect(parsePrefs(null)).toMatchObject({ app: "scan", area: "my", workflow: "prepare", complexity: "standard" });
    expect(parsePrefs({ app: "x", area: "y", workflow: "z", complexity: "q" })).toMatchObject({ app: "scan", area: "my", workflow: "prepare", complexity: "standard" });
  });

  it("setters update state and persist the pref slice", () => {
    useDeskStore.getState().setApp("desk");
    useDeskStore.getState().setWorkflow("live");
    useDeskStore.getState().setComplexity("advanced");
    expect(useDeskStore.getState().app).toBe("desk");
    const raw = localStorage.getItem(deskKey("workspace", 1));
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw!).data;
    expect(saved).toMatchObject({ app: "desk", workflow: "live", complexity: "advanced" });
    expect(saved.setApp).toBeUndefined(); // actions are not persisted
  });
});

describe("Simplify (deskUiStore)", () => {
  beforeEach(() => {
    useDeskStore.setState({ app: "desk", area: "my", workflow: "prepare", complexity: "advanced", layoutByWorkflow: {}, focusSets: {} });
    useDeskUiStore.setState({ focusOn: false, simplifyPrev: null, selectedObjectId: null, asOf: "latest" });
  });

  it("jumps to Minimal and restores the exact previous level", () => {
    useDeskUiStore.getState().simplify();
    expect(useDeskStore.getState().complexity).toBe("minimal");
    expect(useDeskUiStore.getState().simplifyPrev).toBe("advanced");
    useDeskUiStore.getState().simplify();
    expect(useDeskStore.getState().complexity).toBe("advanced");
    expect(useDeskUiStore.getState().simplifyPrev).toBeNull();
  });

  it("Focus toggle never writes viewStore.asOf (Desk has its own clock)", () => {
    useDeskUiStore.getState().toggleFocus();
    expect(useDeskUiStore.getState().focusOn).toBe(true);
    expect(useDeskUiStore.getState().asOf).toBe("latest");
  });
});
