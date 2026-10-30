/** W6: screen detection (Window Management API), placement maths and remembered bounds. Pure except the injectable deps. */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenInfo {
  id: string;
  label: string;
  isPrimary: boolean;
  isInternal: boolean;
  /** Full screen rectangle in the global coordinate space. */
  frame: Bounds;
  /** Usable rectangle (excludes taskbar / menu bar). */
  avail: Bounds;
}

export type DetectStatus = "ok" | "unsupported" | "denied" | "error";
export interface DetectResult {
  status: DetectStatus;
  screens: ScreenInfo[];
}

interface RawScreen {
  label?: string;
  isPrimary?: boolean;
  isInternal?: boolean;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  availLeft?: number;
  availTop?: number;
  availWidth?: number;
  availHeight?: number;
}

export interface ScreenDeps {
  getScreenDetails?: () => Promise<{ screens: readonly RawScreen[] }>;
}

const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function toScreenInfo(raw: RawScreen, i: number): ScreenInfo | null {
  const width = num(raw.width, 0);
  const height = num(raw.height, 0);
  if (width <= 0 || height <= 0) return null;
  const x = num(raw.left, 0);
  const y = num(raw.top, 0);
  return {
    id: `s${i}`,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : `Screen ${i + 1}`,
    isPrimary: raw.isPrimary === true,
    isInternal: raw.isInternal === true,
    frame: { x, y, width, height },
    avail: {
      x: num(raw.availLeft, x),
      y: num(raw.availTop, y),
      width: num(raw.availWidth, width),
      height: num(raw.availHeight, height),
    },
  };
}

export function realScreenDeps(): ScreenDeps {
  if (typeof window === "undefined") return {};
  const w = window as unknown as { getScreenDetails?: ScreenDeps["getScreenDetails"] };
  return typeof w.getScreenDetails === "function" ? { getScreenDetails: () => w.getScreenDetails!() } : {};
}

export const supportsWindowManagement = (deps: ScreenDeps = realScreenDeps()): boolean =>
  typeof deps.getScreenDetails === "function";

/** Prompts for permission (call from a user gesture). Never throws. */
export async function detectScreens(deps: ScreenDeps = realScreenDeps()): Promise<DetectResult> {
  if (!deps.getScreenDetails) return { status: "unsupported", screens: [] };
  try {
    const d = await deps.getScreenDetails();
    const screens = d.screens.map((s, i) => toScreenInfo(s, i)).filter((s): s is ScreenInfo => s !== null);
    return screens.length > 0 ? { status: "ok", screens } : { status: "unsupported", screens: [] };
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    return { status: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error", screens: [] };
  }
}

const rb = (b: Bounds): Bounds => ({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });

/** `fill`: the whole usable area. Otherwise a centred window with an 8% margin. */
export function placementBounds(screen: ScreenInfo, fill: boolean): Bounds {
  const a = screen.avail;
  if (fill) return rb(a);
  const mx = a.width * 0.08;
  const my = a.height * 0.08;
  return rb({ x: a.x + mx, y: a.y + my, width: a.width - 2 * mx, height: a.height - 2 * my });
}

export const featuresFor = (b: Bounds): string => `popup,left=${b.x},top=${b.y},width=${b.width},height=${b.height}`;

export interface MapBox {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** To-scale layout of all screens inside a `boxW` x `boxH` area, centred, aspect preserved. */
export function mapLayout(screens: readonly ScreenInfo[], boxW: number, boxH: number, pad = 6): MapBox[] {
  if (screens.length === 0) return [];
  const minX = Math.min(...screens.map((s) => s.frame.x));
  const minY = Math.min(...screens.map((s) => s.frame.y));
  const maxX = Math.max(...screens.map((s) => s.frame.x + s.frame.width));
  const maxY = Math.max(...screens.map((s) => s.frame.y + s.frame.height));
  const uw = maxX - minX;
  const uh = maxY - minY;
  const scale = Math.min((boxW - 2 * pad) / uw, (boxH - 2 * pad) / uh);
  const ox = (boxW - uw * scale) / 2;
  const oy = (boxH - uh * scale) / 2;
  return screens.map((s) => ({
    id: s.id,
    left: ox + (s.frame.x - minX) * scale,
    top: oy + (s.frame.y - minY) * scale,
    width: s.frame.width * scale,
    height: s.frame.height * scale,
  }));
}

// ---------- remembered bounds (best effort; the user drags a window once and we reuse it) ----------
type KV = Pick<Storage, "getItem" | "setItem">;
const boundsKey = (roleKey: string): string => `spekrym.bounds.${roleKey}`;

function defaultStorage(): KV | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const inRange = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

export function parseBounds(raw: unknown): Bounds | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!inRange(r.x, -20000, 20000) || !inRange(r.y, -20000, 20000)) return null;
  if (!inRange(r.width, 200, 10000) || !inRange(r.height, 200, 10000)) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export function loadBounds(roleKey: string, storage: KV | undefined = defaultStorage()): Bounds | null {
  try {
    const s = storage?.getItem(boundsKey(roleKey));
    return s ? parseBounds(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

export function saveBounds(roleKey: string, b: Bounds, storage: KV | undefined = defaultStorage()): void {
  const ok = parseBounds(b);
  if (!ok) return;
  try {
    storage?.setItem(boundsKey(roleKey), JSON.stringify(ok));
  } catch {
    /* storage unavailable: skip */
  }
}

export function currentBounds(w: Window = window): Bounds {
  return rb({ x: w.screenX ?? w.screenLeft ?? 0, y: w.screenY ?? w.screenTop ?? 0, width: w.outerWidth, height: w.outerHeight });
}