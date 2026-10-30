/** W4: open / re-dock role windows. URL building and close-watching are pure and injectable for tests. W6: placement bounds. W7: fullscreen hint, open-window listing. */
import { useDockStore } from "./dockStore";
import { ROLE_PARAM, roleParam, type WindowRole } from "./role";
import { featuresFor, loadBounds, type Bounds } from "./screens";

export interface WindowLike {
  readonly closed: boolean;
  close(): void;
  focus(): void;
  moveTo?(x: number, y: number): void;
  resizeTo?(w: number, h: number): void;
  readonly screenX?: number;
  readonly screenY?: number;
  readonly outerWidth?: number;
  readonly outerHeight?: number;
  readonly document?: { readonly fullscreenElement?: unknown } | null;
}

export interface PopoutDeps {
  open: (url: string, target: string, features: string) => WindowLike | null;
  href: string;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
}

export interface PopoutOptions {
  /** Place the window here (e.g. on a chosen screen). Without it, the last remembered bounds are used. */
  bounds?: Bounds;
  /** The new window offers full screen on its first click (a window cannot be made fullscreen from outside). */
  fullscreen?: boolean;
}

export const FULLSCREEN_PARAM = "fs";

export const roleKey = (r: WindowRole): string => roleParam(r) ?? "main";

export function roleLabel(r: WindowRole): string {
  return r.kind === "chart" ? `${r.tf} chart` : r.kind;
}

/** The current URL (so the new window boots with the same state) with `?window=` set to the role. */
export function popoutUrl(role: WindowRole, href: string, fullscreen = false): string {
  const u = new URL(href);
  const key = roleParam(role);
  if (key) u.searchParams.set(ROLE_PARAM, key);
  else u.searchParams.delete(ROLE_PARAM);
  if (fullscreen) u.searchParams.set(FULLSCREEN_PARAM, "1");
  else u.searchParams.delete(FULLSCREEN_PARAM);
  u.searchParams.delete("ws");
  return u.toString();
}

const defaultFeatures = (r: WindowRole): string => (r.kind === "setups" ? "popup,width=480,height=900" : "popup,width=1280,height=860");

const features = (r: WindowRole, bounds?: Bounds): string => {
  const b = bounds ?? loadBounds(roleKey(r));
  return b ? featuresFor(b) : defaultFeatures(r);
};

/** Polls `win.closed` (there is no close event for another window). Returns stop. */
export function watchClosed(win: WindowLike, onClosed: () => void, d: Pick<PopoutDeps, "setInterval" | "clearInterval"> = realDeps(), ms = 500): () => void {
  const id = d.setInterval(() => {
    if (!win.closed) return;
    d.clearInterval(id);
    onClosed();
  }, ms);
  return () => d.clearInterval(id);
}

function realDeps(): PopoutDeps {
  return {
    open: (url, target, f) => window.open(url, target, f),
    href: window.location.href,
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id as number),
  };
}

const handles = new Map<string, WindowLike>();

/** Role windows this window opened and that are still open, as `[roleKey, window]`. */
export function openWindows(): Array<[string, WindowLike]> {
  return [...handles].filter(([, w]) => !w.closed);
}

/** Opens (or focuses/moves) the role window. Returns false when the browser blocked it. Must run inside a user gesture. */
export function openPopout(role: WindowRole, deps: PopoutDeps = realDeps(), opts: PopoutOptions = {}): boolean {
  const key = roleKey(role);
  const dock = useDockStore.getState();
  const existing = handles.get(key);
  if (existing && !existing.closed) {
    if (opts.bounds) {
      try {
        existing.moveTo?.(opts.bounds.x, opts.bounds.y);
        existing.resizeTo?.(opts.bounds.width, opts.bounds.height);
      } catch {
        /* the browser refused: just focus */
      }
    }
    existing.focus();
    return true;
  }
  let win: WindowLike | null = null;
  try {
    win = deps.open(popoutUrl(role, deps.href, opts.fullscreen === true), `spekrym-${key}`, features(role, opts.bounds));
  } catch {
    win = null;
  }
  if (!win) {
    dock.setNotice("Pop-up blocked. Allow pop-ups for this site, then try again.");
    return false;
  }
  handles.set(key, win);
  dock.setNotice(null);
  dock.markPopped(key);
  watchClosed(win, () => {
    handles.delete(key);
    useDockStore.getState().markDocked(key);
  }, deps);
  return true;
}

/** Closes the role window (if we opened it) and docks the role back into this window. */
export function redock(key: string): void {
  const w = handles.get(key);
  handles.delete(key);
  try {
    w?.close();
  } catch {
    /* already closed */
  }
  useDockStore.getState().markDocked(key);
}

export const hasHandle = (key: string): boolean => handles.has(key);