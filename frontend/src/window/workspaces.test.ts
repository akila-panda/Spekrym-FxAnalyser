import { beforeEach, describe, expect, it } from "vitest";
import { loadPresets, savePreset } from "@/presets/presets";
import { toScreenInfo } from "./screens";
import {
  captureWorkspace, decodeWorkspace, encodeWorkspace, parseWorkspace, readWorkspaceParam, resolveBounds, restoreWorkspace,
  screenAt, workspaceUrl, type WorkspaceEntry,
} from "./workspaces";

const s0 = toScreenInfo({ label: "Main", isPrimary: true, left: 0, top: 0, width: 1920, height: 1080 }, 0)!;
const s1 = toScreenInfo({ label: "Side", left: 1920, top: 0, width: 2560, height: 1440 }, 1)!;
const E = (role: string, over: Partial<WorkspaceEntry> = {}): WorkspaceEntry => ({ role, fullscreen: false, ...over });

describe("W7 parse / encode", () => {
  it("keeps valid roles once, drops main/unknown/bad bounds, caps and returns null when empty", () => {
    const w = parseWorkspace([E("charts"), E("charts"), E("main"), E("chart:M5"), E("chart:X9"), { role: "stack", bounds: { x: 0, y: 0, width: 5, height: 5 }, fullscreen: false }, 7]);
    expect(w?.map((e) => e.role)).toEqual(["charts", "chart:M5"]);
    expect(parseWorkspace([])).toBeNull();
    expect(parseWorkspace("x")).toBeNull();
    expect(parseWorkspace(Array.from({ length: 20 }, () => E("charts")))).toHaveLength(1);
  });

  it("round-trips through the URL encoding", () => {
    const list = [E("charts", { bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, fullscreen: true }), E("setups", { bounds: { x: -300, y: 10, width: 480, height: 900 } }), E("chart:M5")];
    expect(encodeWorkspace(list)).toBe("charts@1920,0,2560,1440!;setups@-300,10,480,900;chart:M5");
    expect(decodeWorkspace(encodeWorkspace(list))).toEqual(list);
  });

  it("rejects malformed encodings", () => {
    for (const bad of ["charts@1,2,3", "main", "x y", "charts@a,b,c,d", "charts@0,0,10,10"]) expect(decodeWorkspace(bad)).toBeNull();
  });

  it("reads and writes the ws param", () => {
    const url = workspaceUrl("http://x.test/?pair=GBP_USD", [E("stack")]);
    expect(new URL(url).searchParams.get("pair")).toBe("GBP_USD");
    expect(readWorkspaceParam(new URL(url).search)?.[0]?.role).toBe("stack");
    expect(readWorkspaceParam("?pair=EUR_USD")).toBeNull();
    expect(new URL(workspaceUrl(url, [])).searchParams.has("ws")).toBe(false);
  });
});

describe("W7 placement", () => {
  it("finds the screen under a window's centre", () => {
    expect(screenAt([s0, s1], { x: 2000, y: 100, width: 800, height: 600 })?.label).toBe("Side");
    expect(screenAt([s0], { x: 5000, y: 0, width: 800, height: 600 })).toBeUndefined();
  });

  it("keeps bounds on a present screen, moves orphaned windows to their screen label or primary, and passes through without screens", () => {
    const inside = E("charts", { bounds: { x: 2000, y: 0, width: 800, height: 600 } });
    expect(resolveBounds(inside, [s0, s1])).toEqual(inside.bounds);
    expect(resolveBounds(inside, [])).toEqual(inside.bounds);
    const orphan = E("charts", { bounds: { x: 9000, y: 0, width: 800, height: 600 }, screen: "Gone", fullscreen: true });
    expect(resolveBounds(orphan, [s0, s1])).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(resolveBounds(E("charts"), [s0])).toBeUndefined();
  });
});

describe("W7 capture / restore", () => {
  it("captures live geometry, falls back to remembered bounds and flags fullscreen", () => {
    const live = { screenX: 1920, screenY: 0, outerWidth: 2560, outerHeight: 1440, document: { fullscreenElement: {} } };
    const dead = { get screenX(): number { throw new Error("closing"); } } as never;
    const out = captureWorkspace([["charts", live], ["stack", dead], ["setups", {}]], [s0, s1], (k) => (k === "stack" ? { x: 10, y: 10, width: 900, height: 700 } : null));
    expect(out).toEqual([
      { role: "charts", fullscreen: true, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, screen: "Side" },
      { role: "stack", fullscreen: false, bounds: { x: 10, y: 10, width: 900, height: 700 }, screen: "Main" },
      { role: "setups", fullscreen: false },
    ]);
  });

  it("stops at the first blocked window and returns it with the rest", () => {
    const list = [E("charts"), E("setups"), E("stack")];
    const opened: string[] = [];
    const r = restoreWorkspace(list, [], (e) => {
      if (e.role === "setups") return false;
      opened.push(e.role);
      return true;
    });
    expect(opened).toEqual(["charts"]);
    expect(r.opened).toBe(1);
    expect(r.rest.map((e) => e.role)).toEqual(["setups", "stack"]);
    expect(restoreWorkspace(list, [], () => true)).toEqual({ opened: 3, rest: [] });
  });
});

describe("W7 preset variants", () => {
  beforeEach(() => localStorage.clear());

  it("stores a workspace with a preset and reloads it", () => {
    const ws = [E("charts", { bounds: { x: 0, y: 0, width: 800, height: 600 } })];
    savePreset("two-screen", { pair: "EUR_USD" }, ws);
    expect(loadPresets()).toEqual([{ name: "two-screen", state: { pair: "EUR_USD" }, workspace: ws }]);
  });

  it("omits an empty workspace and drops an invalid stored one", () => {
    savePreset("plain", { pair: "EUR_USD" }, []);
    expect(loadPresets()).toEqual([{ name: "plain", state: { pair: "EUR_USD" } }]);
    localStorage.setItem("spekrym.presets.v1", JSON.stringify([{ name: "x", state: {}, workspace: [{ role: "main" }] }]));
    expect(loadPresets()).toEqual([{ name: "x", state: {} }]);
  });
});