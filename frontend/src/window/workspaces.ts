/** W7: workspaces = which role windows are open, where (screen/bounds) and whether they fill the screen. Pure. */
import { parseRole, roleParam } from "./role";
import { parseBounds, placementBounds, type Bounds, type ScreenInfo } from "./screens";

export interface WorkspaceEntry {
  /** Canonical role key: charts | setups | stack | chart:<TF>. */
  role: string;
  bounds?: Bounds;
  /** Screen label at capture time (informational; placement uses bounds). */
  screen?: string;
  fullscreen: boolean;
}

export const WS_PARAM = "ws";
export const MAX_WORKSPACE_WINDOWS = 8;

const ALLOWED = new Set(["charts", "setups", "stack", "chart"]);

function canonicalRole(key: unknown): string | null {
  if (typeof key !== "string" || key.length > 16) return null;
  const r = parseRole(`?window=${key}`);
  if (!ALLOWED.has(r.kind)) return null;
  const k = roleParam(r);
  return k !== null && k === key ? k : null;
}

export function parseWorkspaceEntry(raw: unknown): WorkspaceEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const role = canonicalRole(r.role);
  if (!role) return null;
  const out: WorkspaceEntry = { role, fullscreen: r.fullscreen === true };
  if (r.bounds !== undefined) {
    const b = parseBounds(r.bounds);
    if (!b) return null;
    out.bounds = b;
  }
  if (typeof r.screen === "string" && r.screen.length <= 64) out.screen = r.screen;
  return out;
}

/** Valid entries only, one per role, capped. Null when the input is not an array or nothing valid is left. */
export function parseWorkspace(raw: unknown): WorkspaceEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: WorkspaceEntry[] = [];
  for (const item of raw) {
    const e = parseWorkspaceEntry(item);
    if (!e || seen.has(e.role)) continue;
    seen.add(e.role);
    out.push(e);
    if (out.length >= MAX_WORKSPACE_WINDOWS) break;
  }
  return out.length > 0 ? out : null;
}

// ---------- URL encoding: `ws=charts@1920,0,2560,1440!;setups@0,0,480,900` ----------
const ENTRY_RE = /^([A-Za-z]+(?::[A-Za-z0-9]+)?)(?:@(-?\d+),(-?\d+),(\d+),(\d+))?(!)?$/;

export function encodeWorkspace(entries: readonly WorkspaceEntry[]): string {
  return entries
    .map((e) => {
      const b = e.bounds;
      const at = b ? `@${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)},${Math.round(b.height)}` : "";
      return `${e.role}${at}${e.fullscreen ? "!" : ""}`;
    })
    .join(";");
}

export function decodeWorkspace(s: string): WorkspaceEntry[] | null {
  const raw: unknown[] = [];
  for (const part of s.split(";")) {
    if (!part) continue;
    const m = ENTRY_RE.exec(part);
    if (!m) return null;
    const entry: Record<string, unknown> = { role: m[1] ?? "", fullscreen: m[6] === "!" };
    if (m[2] !== undefined) entry.bounds = { x: Number(m[2]), y: Number(m[3]), width: Number(m[4]), height: Number(m[5]) };
    raw.push(entry);
  }
  return parseWorkspace(raw);
}

export function readWorkspaceParam(search: string): WorkspaceEntry[] | null {
  const v = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(WS_PARAM);
  return v ? decodeWorkspace(v) : null;
}

export function workspaceUrl(href: string, entries: readonly WorkspaceEntry[]): string {
  const u = new URL(href);
  const enc = encodeWorkspace(entries);
  if (enc) u.searchParams.set(WS_PARAM, enc);
  else u.searchParams.delete(WS_PARAM);
  return u.toString();
}

// ---------- placement ----------
export function screenAt(screens: readonly ScreenInfo[], b: Bounds): ScreenInfo | undefined {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return screens.find((s) => cx >= s.frame.x && cx < s.frame.x + s.frame.width && cy >= s.frame.y && cy < s.frame.y + s.frame.height);
}

/** Bounds to open at. A window whose saved spot no longer exists (monitor unplugged) lands on its old screen by label, else primary. */
export function resolveBounds(e: WorkspaceEntry, screens: readonly ScreenInfo[]): Bounds | undefined {
  if (!e.bounds) return undefined;
  if (screens.length === 0) return e.bounds;
  if (screenAt(screens, e.bounds)) return e.bounds;
  const target = screens.find((s) => s.label === e.screen) ?? screens.find((s) => s.isPrimary) ?? screens[0];
  return target ? placementBounds(target, e.fullscreen) : e.bounds;
}

// ---------- capture ----------
export interface LiveWindow {
  readonly screenX?: number;
  readonly screenY?: number;
  readonly outerWidth?: number;
  readonly outerHeight?: number;
  readonly document?: { readonly fullscreenElement?: unknown } | null;
}

function liveBounds(w: LiveWindow): Bounds | null {
  try {
    return parseBounds({ x: w.screenX, y: w.screenY, width: w.outerWidth, height: w.outerHeight });
  } catch {
    return null; // cross-window access can throw on a closing window
  }
}

function isFullscreen(w: LiveWindow): boolean {
  try {
    return !!w.document?.fullscreenElement;
  } catch {
    return false;
  }
}

/** Snapshot of the currently open role windows. Live geometry wins; otherwise the last remembered bounds. */
export function captureWorkspace(
  handles: ReadonlyArray<readonly [string, LiveWindow]>,
  screens: readonly ScreenInfo[],
  remembered: (roleKey: string) => Bounds | null,
): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];
  for (const [role, win] of handles) {
    const bounds = liveBounds(win) ?? remembered(role) ?? undefined;
    const screen = bounds ? screenAt(screens, bounds)?.label : undefined;
    entries.push({ role, fullscreen: isFullscreen(win), ...(bounds ? { bounds } : {}), ...(screen ? { screen } : {}) });
  }
  return parseWorkspace(entries) ?? [];
}

// ---------- restore ----------
export interface RestoreResult {
  opened: number;
  /** Entries not opened yet (starting with the one the browser blocked). */
  rest: WorkspaceEntry[];
}

/** Opens entries in order and stops at the first one the browser refuses; each remaining open needs its own click. */
export function restoreWorkspace(
  entries: readonly WorkspaceEntry[],
  screens: readonly ScreenInfo[],
  open: (e: WorkspaceEntry, bounds: Bounds | undefined) => boolean,
): RestoreResult {
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]!;
    if (!open(e, resolveBounds(e, screens))) return { opened: i, rest: entries.slice(i) };
  }
  return { opened: entries.length, rest: [] };
}