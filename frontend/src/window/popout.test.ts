import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDockStore } from "./dockStore";
import { openPopout, popoutUrl, redock, roleKey, roleLabel, watchClosed, type PopoutDeps, type WindowLike } from "./popout";

const fakeWin = (): WindowLike & { closed: boolean; focused: number } => {
  const w = { closed: false, focused: 0, close() { w.closed = true; }, focus() { w.focused += 1; } };
  return w;
};

const deps = (win: WindowLike | null, ticks: Array<() => void> = []): PopoutDeps => ({
  open: vi.fn(() => win),
  href: "http://x.test/?pair=GBP_USD&layout=stack",
  setInterval: (fn) => { ticks.push(fn); return ticks.length; },
  clearInterval: () => undefined,
});

beforeEach(() => {
  useDockStore.setState({ popped: new Set(), notice: null });
  redock("charts");
  redock("stack");
});

describe("W4 popout url / labels", () => {
  it("keeps state params and sets the role", () => {
    const u = new URL(popoutUrl({ kind: "charts" }, "http://x.test/?pair=GBP_USD"));
    expect(u.searchParams.get("pair")).toBe("GBP_USD");
    expect(u.searchParams.get("window")).toBe("charts");
  });
  it("chart role encodes the timeframe; main removes the param", () => {
    expect(new URL(popoutUrl({ kind: "chart", tf: "M5" }, "http://x.test/")).searchParams.get("window")).toBe("chart:M5");
    expect(popoutUrl({ kind: "main" }, "http://x.test/?window=charts")).toBe("http://x.test/");
  });
  it("keys and labels", () => {
    expect(roleKey({ kind: "chart", tf: "H1" })).toBe("chart:H1");
    expect(roleKey({ kind: "main" })).toBe("main");
    expect(roleLabel({ kind: "chart", tf: "H1" })).toBe("H1 chart");
    expect(roleLabel({ kind: "stack" })).toBe("stack");
  });
});

describe("W4 open / re-dock", () => {
  it("opens, marks popped, and re-docks when the window closes", () => {
    const w = fakeWin();
    const ticks: Array<() => void> = [];
    expect(openPopout({ kind: "charts" }, deps(w, ticks))).toBe(true);
    expect(useDockStore.getState().popped.has("charts")).toBe(true);
    w.closed = true;
    ticks[0]!();
    expect(useDockStore.getState().popped.has("charts")).toBe(false);
  });
  it("a blocked popup sets a notice and marks nothing", () => {
    expect(openPopout({ kind: "stack" }, deps(null))).toBe(false);
    expect(useDockStore.getState().notice).toMatch(/blocked/i);
    expect(useDockStore.getState().popped.size).toBe(0);
  });
  it("a second open focuses the existing window instead of opening another", () => {
    const w = fakeWin();
    const d = deps(w);
    openPopout({ kind: "charts" }, d);
    openPopout({ kind: "charts" }, d);
    expect(d.open).toHaveBeenCalledTimes(1);
    expect(w.focused).toBe(1);
  });
  it("redock closes the window and clears the flag", () => {
    const w = fakeWin();
    openPopout({ kind: "charts" }, deps(w));
    redock("charts");
    expect(w.closed).toBe(true);
    expect(useDockStore.getState().popped.has("charts")).toBe(false);
  });
  it("watchClosed stops polling after the first close", () => {
    const w = fakeWin();
    const cleared: unknown[] = [];
    const ticks: Array<() => void> = [];
    const onClosed = vi.fn();
    watchClosed(w, onClosed, { setInterval: (fn) => { ticks.push(fn); return 7; }, clearInterval: (id) => cleared.push(id) });
    ticks[0]!();
    expect(onClosed).not.toHaveBeenCalled();
    w.closed = true;
    ticks[0]!();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(cleared).toContain(7);
  });
});