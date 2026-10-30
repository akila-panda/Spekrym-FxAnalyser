import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDeskStore } from "./deskStore";
import { useDeskUiStore } from "./deskUiStore";
import { useDeskKeys } from "./useDeskKeys";

const key = (k: string, target?: EventTarget) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true });
  if (target) Object.defineProperty(e, "target", { value: target });
  window.dispatchEvent(e);
};

beforeEach(() => {
  useDeskStore.setState({ app: "desk", area: "my", workflow: "prepare", complexity: "advanced", layoutByWorkflow: {}, focusSets: {} });
  useDeskUiStore.setState({ focusOn: false, simplifyPrev: null, selectedObjectId: null, asOf: "latest" });
});

describe("useDeskKeys", () => {
  it("F toggles Focus, Esc restores it", () => {
    renderHook(() => useDeskKeys());
    key("f");
    expect(useDeskUiStore.getState().focusOn).toBe(true);
    key("Escape");
    expect(useDeskUiStore.getState().focusOn).toBe(false);
  });

  it("S simplifies, H/A switch area, P/L/V switch workflow", () => {
    renderHook(() => useDeskKeys());
    key("s");
    expect(useDeskStore.getState().complexity).toBe("minimal");
    key("a");
    expect(useDeskStore.getState().area).toBe("analysis");
    key("v");
    expect(useDeskStore.getState().workflow).toBe("review");
  });

  it("ignores keys while typing in an input", () => {
    renderHook(() => useDeskKeys());
    const input = document.createElement("input");
    key("f", input);
    expect(useDeskUiStore.getState().focusOn).toBe(false);
  });
});
