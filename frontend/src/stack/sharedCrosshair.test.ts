import { beforeEach, describe, expect, it } from "vitest";
import { createRemoteGuard } from "@/sync/protocol";
import { useCursorStore } from "./cursorStore";
import { snapToBar } from "./sharedCrosshair";

const H = 3600;
const bars = [0, 1, 2, 5, 6].map((i) => ({ time: i * H })); // gap at 3h, 4h

describe("S5 snapToBar", () => {
  it("lands on the containing bar, not the nearest open", () => {
    expect(snapToBar(bars, 1 * H + 3000, H)).toBe(1);
    expect(snapToBar(bars, 2 * H + 3500, H)).toBe(2);
  });
  it("exact open snaps to that bar", () => expect(snapToBar(bars, 5 * H, H)).toBe(3));
  it("gap snaps to the closer neighbour", () => {
    expect(snapToBar(bars, 3 * H + 600, H)).toBe(2);
    expect(snapToBar(bars, 4 * H + 3000, H)).toBe(3);
  });
  it("outside the loaded data is null", () => {
    expect(snapToBar(bars, -1, H)).toBeNull();
    expect(snapToBar(bars, 7 * H, H)).toBeNull();
    expect(snapToBar([], 5, H)).toBeNull();
    expect(snapToBar(bars, NaN, H)).toBeNull();
  });
  it("a M5 time inside an H1 maps to that H1", () => {
    const m5 = 10 * H + 35 * 300 / 5; // 10:35
    const h1 = [{ time: 10 * H }, { time: 11 * H }];
    expect(snapToBar(h1, m5, H)).toBe(0);
  });
});

describe("S5 cursor store + guard", () => {
  beforeEach(() => useCursorStore.setState({ time: null, source: null }));
  it("set then clear by owner", () => {
    useCursorStore.getState().set(100, "H1");
    expect(useCursorStore.getState().time).toBe(100);
    useCursorStore.getState().clear("H1");
    expect(useCursorStore.getState().time).toBeNull();
  });
  it("a stale leave from another row does not clear a newer hover", () => {
    useCursorStore.getState().set(100, "M5");
    useCursorStore.getState().clear("H1");
    expect(useCursorStore.getState().source).toBe("M5");
  });
  it("identical set does not notify", () => {
    let n = 0;
    useCursorStore.getState().set(100, "H1");
    const off = useCursorStore.subscribe(() => (n += 1));
    useCursorStore.getState().set(100, "H1");
    off();
    expect(n).toBe(0);
  });
  it("guard is active only while applying and re-entrant", () => {
    const g = createRemoteGuard();
    expect(g.active).toBe(false);
    g.run(() => {
      expect(g.active).toBe(true);
      g.run(() => expect(g.active).toBe(true));
      expect(g.active).toBe(true);
    });
    expect(g.active).toBe(false);
  });
});