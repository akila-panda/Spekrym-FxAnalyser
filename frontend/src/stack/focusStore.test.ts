import { beforeEach, describe, expect, it } from "vitest";
import { useFocusStore } from "./focusStore";
import { TF_SECONDS } from "@/types/market";

const T0 = Date.UTC(2025, 3, 7, 10, 20, 0) / 1000;

beforeEach(() => useFocusStore.getState().reset());

describe("S3 focus store", () => {
  it("focusAt snaps to the parent bucket", () => {
    useFocusStore.getState().focusAt(T0, "H1");
    const f = useFocusStore.getState().focus!;
    expect(f.interval[0]).toBe(Date.UTC(2025, 3, 7, 10, 0, 0) / 1000);
    expect(f.interval[1] - f.interval[0]).toBe(TF_SECONDS.H1);
    expect(f.parentTF).toBe("H1");
  });
  it("keeps history and back() restores without recompute", () => {
    const s = useFocusStore.getState();
    s.focusAt(T0, "H1");
    const first = useFocusStore.getState().focus;
    s.focusAt(T0 + 7200, "H1");
    expect(useFocusStore.getState().history).toHaveLength(1);
    useFocusStore.getState().back();
    expect(useFocusStore.getState().focus).toBe(first);
  });
  it("ignores an identical focus", () => {
    const s = useFocusStore.getState();
    s.focusAt(T0, "H1");
    s.focusAt(T0 + 5, "H1");
    expect(useFocusStore.getState().history).toHaveLength(0);
  });
  it("detach / re-snap per row and all", () => {
    const s = useFocusStore.getState();
    s.setDetached("M5", true);
    s.setDetached("H1", true);
    expect(useFocusStore.getState().detached.has("M5")).toBe(true);
    useFocusStore.getState().resnap("M5");
    expect(useFocusStore.getState().detached.has("M5")).toBe(false);
    expect(useFocusStore.getState().detached.has("H1")).toBe(true);
    useFocusStore.getState().resnapAll();
    expect(useFocusStore.getState().detached.size).toBe(0);
  });
  it("a focus change does not clear detached rows", () => {
    const s = useFocusStore.getState();
    s.setDetached("M1", true);
    s.focusAt(T0, "H1");
    expect(useFocusStore.getState().detached.has("M1")).toBe(true);
  });
});