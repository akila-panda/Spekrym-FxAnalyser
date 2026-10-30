import { beforeEach, describe, expect, it } from "vitest";
import { useFocusStore } from "./focusStore";

beforeEach(() => useFocusStore.getState().reset());

describe("S3+ alignAll", () => {
  it("clears detached rows and bumps the nonce", () => {
    const s = useFocusStore.getState();
    s.setDetached("M5", true);
    s.setDetached("M1", true);
    s.alignAll();
    const n = useFocusStore.getState();
    expect(n.detached.size).toBe(0);
    expect(n.alignNonce).toBe(1);
  });

  it("bumps the nonce even when nothing is detached, so rows re-apply", () => {
    useFocusStore.getState().alignAll();
    useFocusStore.getState().alignAll();
    expect(useFocusStore.getState().alignNonce).toBe(2);
  });
});