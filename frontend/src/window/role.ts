import { TIMEFRAMES, type Timeframe } from "@/types/market";

export type WindowRole =
  | { kind: "main" }
  | { kind: "charts" }
  | { kind: "setups" }
  | { kind: "stack" }
  | { kind: "analytics" }
  | { kind: "journal" }
  | { kind: "canvas" }
  | { kind: "workbench" }
  | { kind: "brain" }
  | { kind: "portfolio" }
  | { kind: "ops" }
  | { kind: "demo" } // DEMO (removable)
  | { kind: "chart"; tf: Timeframe };

export const ROLE_PARAM = "window";
export const MAIN: WindowRole = { kind: "main" };

const SIMPLE = ["charts", "setups", "stack", "analytics", "journal", "canvas", "workbench", "brain", "portfolio", "ops", "demo"] as const;
type SimpleKind = (typeof SIMPLE)[number];

const toParams = (search: string): URLSearchParams =>
  new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

/** Parses `?window=` into a role. Missing or invalid values fall back to `main`. */
export function parseRole(search: string): WindowRole {
  const raw = toParams(search).get(ROLE_PARAM)?.trim();
  if (!raw) return MAIN;
  const v = raw.toLowerCase();
  if ((SIMPLE as readonly string[]).includes(v)) return { kind: v as SimpleKind };
  if (v.startsWith("chart:")) {
    const tf = raw.slice("chart:".length).toUpperCase();
    if ((TIMEFRAMES as readonly string[]).includes(tf)) return { kind: "chart", tf: tf as Timeframe };
  }
  return MAIN;
}

/** Value for `?window=`, or null for `main`. */
export function roleParam(role: WindowRole): string | null {
  if (role.kind === "main") return null;
  return role.kind === "chart" ? `chart:${role.tf}` : role.kind;
}

export function roleEquals(a: WindowRole, b: WindowRole): boolean {
  return a.kind === b.kind && (a.kind !== "chart" || (b.kind === "chart" && a.tf === b.tf));
}

/** Re-attaches the current `window` param to a rewritten query so URL mirroring never erases the role. */
export function withRoleParam(query: string, search: string): string {
  const cur = toParams(search).get(ROLE_PARAM);
  if (!cur) return query;
  const q = new URLSearchParams(query);
  q.set(ROLE_PARAM, cur);
  return q.toString();
}