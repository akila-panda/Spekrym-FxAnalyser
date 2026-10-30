import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDockStore } from "./dockStore";
import { openPopout, redock, type PopoutDeps, type WindowLike } from "./popout";
import {
  detectScreens, featuresFor, loadBounds, mapLayout, parseBounds, placementBounds, saveBounds, supportsWindowManagement,
  toScreenInfo, type ScreenInfo,
} from "./screens";

const raw = (o: Record<string, unknown> = {}) => ({ label: "Main", isPrimary: true, left: 0, top: 0, width: 1920, height: 1080, availLeft: 0, availTop: 25, availWidth: 1920, availHeight: 1055, ...o });
const two = (): ScreenInfo[] => [toScreenInfo(raw(), 0)!, toScreenInfo(raw({ label: "", isPrimary: false, left: 1920, availLeft: 1920, width: 2560, availWidth: 2560, height: 1440, availHeight: 1440, availTop: 0 }), 1)!];

describe("W6 screens", () => {
  it("maps raw screens, defaults labels, rejects empty sizes", () => {
    const s = two();
    expect(s[0]).toMatchObject({ id: "s0", label: "Main", isPrimary: true });
    expect(s[1]).toMatchObject({ label: "Screen 2", isPrimary: false, frame: { x: 1920, width: 2560 } });
    expect(toScreenInfo(raw({ width: 0 }), 0)).toBeNull();
  });

  it("detects: unsupported, ok, denied, error", async () => {
    expect(supportsWindowManagement({})).toBe(false);
    expect((await detectScreens({})).status).toBe("unsupported");
    const ok = await detectScreens({ getScreenDetails: async () => ({ screens: [raw(), raw({ left: 1920 })] }) });
    expect(ok.status).toBe("ok");
    expect(ok.screens).toHaveLength(2);
    const denied = await detectScreens({ getScreenDetails: () => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })) });
    expect(denied.status).toBe("denied");
    expect((await detectScreens({ getScreenDetails: () => Promise.reject(new Error("boom")) })).status).toBe("error");
    expect((await detectScreens({ getScreenDetails: async () => ({ screens: [] }) })).status).toBe("unsupported");
  });

  it("placement: fill uses the usable area, otherwise a centred 84% window", () => {
    const s = two()[0]!;
    expect(placementBounds(s, true)).toEqual({ x: 0, y: 25, width: 1920, height: 1055 });
    const w = placementBounds(s, false);
    expect(w.x).toBeGreaterThan(0);
    expect(w.width).toBeLessThan(1920);
    expect(featuresFor({ x: 1, y: 2, width: 3, height: 4 })).toBe("popup,left=1,top=2,width=3,height=4");
  });

  it("map layout is to scale, centred and inside the box", () => {
    const s = two();
    const m = mapLayout(s, 240, 120);
    expect(m).toHaveLength(2);
    for (const b of m) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.left + b.width).toBeLessThanOrEqual(240 + 1e-9);
      expect(b.top + b.height).toBeLessThanOrEqual(120 + 1e-9);
    }
    expect(m[1]!.width / m[0]!.width).toBeCloseTo(2560 / 1920, 5);
    expect(m[1]!.left).toBeGreaterThan(m[0]!.left);
    expect(mapLayout([], 240, 120)).toEqual([]);
  });

  it("remembers bounds and rejects junk", () => {
    const mem = new Map<string, string>();
    const kv = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveBounds("charts", { x: 10, y: 20, width: 800, height: 600 }, kv);
    expect(loadBounds("charts", kv)).toEqual({ x: 10, y: 20, width: 800, height: 600 });
    saveBounds("stack", { x: 0, y: 0, width: 10, height: 10 }, kv);
    expect(loadBounds("stack", kv)).toBeNull();
    mem.set("spekrym.bounds.bad", "{nope");
    expect(loadBounds("bad", kv)).toBeNull();
    for (const bad of [null, 1, {}, { x: 0, y: 0, width: "a", height: 300 }, { x: NaN, y: 0, width: 300, height: 300 }]) expect(parseBounds(bad)).toBeNull();
  });
});

describe("W6 openPopout with bounds", () => {
  const fakeWin = () => {
    const w = { closed: false, close: vi.fn(), focus: vi.fn(), moveTo: vi.fn(), resizeTo: vi.fn() };
    return w as unknown as WindowLike & { moveTo: ReturnType<typeof vi.fn>; resizeTo: ReturnType<typeof vi.fn> };
  };
  const deps = (win: WindowLike | null): PopoutDeps => ({
    open: vi.fn(() => win),
    href: "http://x.test/",
    setInterval: () => 1,
    clearInterval: () => undefined,
  });
  beforeEach(() => {
    useDockStore.setState({ popped: new Set(), notice: null });
    redock("charts");
  });

  it("opens at the given screen bounds", () => {
    const d = deps(fakeWin());
    openPopout({ kind: "charts" }, d, { bounds: { x: 1920, y: 0, width: 2560, height: 1440 } });
    expect(d.open).toHaveBeenCalledWith(expect.any(String), "spekrym-charts", "popup,left=1920,top=0,width=2560,height=1440");
  });

  it("moves an already open window instead of opening another", () => {
    const w = fakeWin();
    const d = deps(w);
    openPopout({ kind: "charts" }, d);
    openPopout({ kind: "charts" }, d, { bounds: { x: 5, y: 6, width: 700, height: 500 } });
    expect(d.open).toHaveBeenCalledTimes(1);
    expect(w.moveTo).toHaveBeenCalledWith(5, 6);
    expect(w.resizeTo).toHaveBeenCalledWith(700, 500);
  });
});