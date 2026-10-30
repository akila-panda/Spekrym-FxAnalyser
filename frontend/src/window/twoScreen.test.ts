import { describe, expect, it } from "vitest";
import { toScreenInfo } from "./screens";
import { planTwoScreen } from "./twoScreen";

const mk = (i: number, o: Record<string, unknown> = {}) =>
  toScreenInfo({ label: `S${i}`, isPrimary: false, left: i * 2000, top: 0, width: 1920, height: 1080, ...o }, i)!;

describe("DX10 two-screen plan", () => {
  it("returns null with fewer than two screens", () => {
    expect(planTwoScreen([])).toBeNull();
    expect(planTwoScreen([mk(0, { isPrimary: true })])).toBeNull();
  });

  it("keeps the workbench on the primary and the stack fills the other screen", () => {
    const p = planTwoScreen([mk(0, { isPrimary: true }), mk(1, { availLeft: 2000, availTop: 0, availWidth: 1900, availHeight: 1000 })])!;
    expect(p.workbench.id).toBe("s0");
    expect(p.stack.id).toBe("s1");
    expect(p.stackBounds).toEqual({ x: 2000, y: 0, width: 1900, height: 1000 });
  });

  it("picks the largest secondary screen and falls back to the first screen when none is primary", () => {
    const small = mk(1);
    const big = mk(2, { width: 3840, height: 2160 });
    expect(planTwoScreen([mk(0, { isPrimary: true }), small, big])!.stack.id).toBe("s2");
    expect(planTwoScreen([mk(0), small])!.workbench.id).toBe("s0");
  });
});