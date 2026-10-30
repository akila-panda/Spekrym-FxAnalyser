import { beforeEach, describe, expect, it } from "vitest";
import { TF_SECONDS, type Candle, type Timeframe } from "@/types/market";
import { breadcrumbTrail, canDrill, drillChain, knownInterval } from "./drill";
import { useFocusStore } from "./focusStore";

const T = Date.UTC(2026, 2, 3, 10, 35, 0) / 1000; // Tue 10:35 UTC
const H1 = Date.UTC(2026, 2, 3, 10, 0, 0) / 1000;
const bar = (time: number): Candle => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 0 }) as Candle;

beforeEach(() => useFocusStore.getState().reset());

describe("S6 drill chain", () => {
  it("composes every level from D down to the clicked TF", () => {
    const c = drillChain("H1", T, {});
    expect(c.map((f) => f.parentTF)).toEqual(["D", "H4", "H1"]);
    expect(c.map((f) => f.drillDepth)).toEqual([0, 1, 2]);
    for (const f of c) expect(T >= f.interval[0] && T < f.interval[1]).toBe(true);
    expect(c[2]!.interval).toEqual([H1, H1 + TF_SECONDS.H1]);
  });
  it("uses actual parent bars when present", () => {
    const c = drillChain("H1", T, { H1: [bar(H1 - 3600), bar(H1), bar(H1 + 3600)] });
    expect(c[2]!.interval).toEqual([H1, H1 + 3600]);
  });
  it("W has no row; M1 cannot drill", () => {
    expect(drillChain("W", T, {})).toEqual([]);
    expect(canDrill("M1")).toBe(false);
    expect(canDrill("H1")).toBe(true);
    expect(canDrill("W")).toBe(false);
  });
  it("DX2: skips hidden rows, keeping depths contiguous", () => {
    const rows: Timeframe[] = ["D", "H1", "M15", "M5", "M1"];
    const c = drillChain("H1", T, {}, undefined, rows);
    expect(c.map((f) => f.parentTF)).toEqual(["D", "H1"]);
    expect(c.map((f) => f.drillDepth)).toEqual([0, 1]);
    expect(drillChain("H4", T, {}, undefined, rows)).toEqual([]);
  });
  it("DX2: canDrill needs a shown row below", () => {
    expect(canDrill("M5", ["D", "M5"])).toBe(false);
    expect(canDrill("D", ["D", "M5"])).toBe(true);
    expect(canDrill("H4", ["D", "M5"])).toBe(false);
  });
  it("clips a forming parent to asOf and flags it", () => {
    const asOf = H1 + 1200;
    expect(knownInterval(H1, H1 + 3600, asOf)).toEqual({ interval: [H1, asOf], forming: true });
    expect(knownInterval(H1, H1 + 3600, H1 + 3600)).toEqual({ interval: [H1, H1 + 3600], forming: false });
    expect(knownInterval(H1, H1 + 3600, null).forming).toBe(false);
    const c = drillChain("H1", T, {}, asOf);
    expect(c[2]!.forming).toBe(true);
    expect(c[2]!.interval[1]).toBe(asOf);
  });
});

describe("S6 focus store drill/back", () => {
  it("drill enters the last level; back pops one level without recompute", () => {
    const chain = drillChain("H1", T, {});
    useFocusStore.getState().drill(chain);
    const s = useFocusStore.getState();
    expect(s.focus).toBe(chain[2]);
    useFocusStore.getState().back();
    expect(useFocusStore.getState().focus).toBe(chain[1]);
  });
  it("backTo jumps to a level", () => {
    const chain = drillChain("M5", T, {});
    useFocusStore.getState().drill(chain);
    useFocusStore.getState().backTo(1);
    expect(useFocusStore.getState().focus).toBe(chain[1]);
  });
  it("drill re-snaps detached rows and bumps the align nonce", () => {
    const s = useFocusStore.getState();
    s.setDetached("M5", true);
    s.drill(drillChain("H1", T, {}));
    expect(useFocusStore.getState().detached.size).toBe(0);
    expect(useFocusStore.getState().alignNonce).toBe(1);
  });
  it("drilling the same candle twice is a no-op", () => {
    useFocusStore.getState().drill(drillChain("H1", T, {}));
    const h = useFocusStore.getState().history.length;
    useFocusStore.getState().drill(drillChain("H1", T + 60, {}));
    expect(useFocusStore.getState().history.length).toBe(h);
  });
  it("breadcrumb trail is the contiguous chain ending at focus", () => {
    useFocusStore.getState().focusAt(T, "H1"); // unrelated depth-0 focus
    useFocusStore.getState().drill(drillChain("H1", T, {}));
    const { focus, history } = useFocusStore.getState();
    expect(breadcrumbTrail(focus, history).map((f) => f.parentTF)).toEqual(["D", "H4", "H1"]);
    expect(breadcrumbTrail(drillChain("D", T, {})[0]!, [])).toEqual([]);
  });
});