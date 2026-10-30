/** DESK DK17 — editable methodology parameters. Pure. The active methodology is DEFAULTS + a sparse map of overrides
 *  (path → value). Every distinct override set yields its own rulesVersion (hash of the full effective config); no overrides
 *  ⇒ exactly rulesVersion(DEFAULTS), so earlier snapshots/decisions keep matching. Presentation constants (caps,
 *  relevanceAtr) are not methodology and are not editable here. Units: thresholds in ATR; the UI shows pips elsewhere. */
import { rulesVersion } from "@/desk/lib/hash";
import { DEFAULTS } from "./defaults";

export type Cfg = typeof DEFAULTS;
export type ParamValue = number | string | boolean;
export type Overrides = Readonly<Record<string, ParamValue>>;

const EXCLUDED = new Set(["caps", "relevanceAtr"]);
const ENUMS: Record<string, readonly string[]> = {
  "structure.breakRule": ["close", "wick"],
  "fvg.fillRule": ["wick", "close"],
  "supplyDemand.bounds": ["body", "wick"],
  "reference.baseTf": ["H1", "H4"],
  "liquidity.detectionTf": ["H1", "H4"],
};
const INT_RE = /^(swingN\.|swingScaleMult$|atrPeriod$|dispMaxBars$|levels\.(reactBars|minGapBars|minReactions|minReactionsIntraday)$|reference\.roundPips$|fvg\.nearestN$|liquidity\.(lookbackDays|followBars)$|supplyDemand\.(baseBarsMin|baseBarsMax|dispWithinBars)$|priceAction\.(tlMinTouches|tlKeepPerTf|failBars|tlLookbackSwings)$)/;
const FRAC_RE = /(tfWeight|significance|obMergeOverlap|pinWickFrac)/;

export interface ParamSpec { kind: "number" | "enum" | "boolean"; int: boolean; min: number; max: number; options?: readonly string[] }
export interface ParamRow { path: string; group: string; value: ParamValue; def: ParamValue; spec: ParamSpec; changed: boolean }

export function specFor(path: string, def: ParamValue): ParamSpec {
  if (typeof def === "boolean") return { kind: "boolean", int: false, min: 0, max: 1 };
  if (typeof def === "string") return { kind: "enum", int: false, min: 0, max: 0, options: ENUMS[path] ?? [def] };
  if (/^reference\.sessions\./.test(path)) return { kind: "number", int: true, min: 0, max: 24 };
  if (path === "reference.roundPips") return { kind: "number", int: true, min: 1, max: 1000 };
  if (/^swingN\./.test(path)) return { kind: "number", int: true, min: 1, max: 20 };
  if (INT_RE.test(path)) return { kind: "number", int: true, min: 1, max: 500 };
  if (FRAC_RE.test(path)) return { kind: "number", int: false, min: 0, max: 1 };
  return { kind: "number", int: false, min: 0.01, max: 100 };
}

/** Every editable leaf of the config, in a stable order. Arrays use index paths ("reference.sessions.london.0"). */
export function flatten(cfg: unknown = DEFAULTS): { path: string; value: ParamValue }[] {
  const out: { path: string; value: ParamValue }[] = [];
  const walk = (v: unknown, p: string): void => {
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") { out.push({ path: p, value: v }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${p}.${i}`)); return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, p ? `${p}.${k}` : k);
  };
  for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) if (!EXCLUDED.has(k)) walk(v, k);
  return out;
}

const DEFAULT_LEAVES = new Map(flatten(DEFAULTS).map((l) => [l.path, l.value]));
export const isParamPath = (path: string): boolean => DEFAULT_LEAVES.has(path);
export const defaultOf = (path: string): ParamValue | undefined => DEFAULT_LEAVES.get(path);

export function validateParam(path: string, value: unknown): string | null {
  const def = DEFAULT_LEAVES.get(path);
  if (def === undefined) return "Unknown parameter.";
  const s = specFor(path, def);
  if (s.kind === "boolean") return typeof value === "boolean" ? null : "Must be on or off.";
  if (s.kind === "enum") return typeof value === "string" && (s.options ?? []).includes(value) ? null : `Choose one of: ${(s.options ?? []).join(", ")}.`;
  if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a number.";
  if (s.int && !Number.isInteger(value)) return "Must be a whole number.";
  if (value < s.min || value > s.max) return `Must be between ${s.min} and ${s.max}.`;
  return null;
}

const same = (a: ParamValue | undefined, b: ParamValue | undefined) => a === b;

/** Drops unknown/invalid entries and entries equal to the default. */
export function cleanOverrides(raw: unknown): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [p, v] of Object.entries(raw as Record<string, unknown>)) {
    if (validateParam(p, v) === null && !same(v as ParamValue, DEFAULT_LEAVES.get(p))) out[p] = v as ParamValue;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Effective config = DEFAULTS with overrides applied (deep copy; DEFAULTS is never mutated). */
export function buildCfg(overrides: Overrides): Cfg {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS)) as Record<string, unknown>;
  for (const [path, v] of Object.entries(overrides)) {
    const keys = path.split(".");
    let node = cfg as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) node = node[keys[i] as string] as Record<string, unknown>;
    node[keys[keys.length - 1] as string] = v;
  }
  return cfg as unknown as Cfg;
}

/** Cross-parameter rules. Returns messages; empty = consistent. */
export function validateConfig(overrides: Overrides): string[] {
  const c = buildCfg(overrides);
  const errs: string[] = [];
  if (c.supplyDemand.baseBarsMin > c.supplyDemand.baseBarsMax) errs.push("supplyDemand: base bars min must not exceed max.");
  for (const [n, h] of Object.entries(c.reference.sessions)) if ((h[0] as number) >= (h[1] as number)) errs.push(`reference.sessions.${n}: start hour must be before end hour.`);
  if (c.levels.minReactions > c.levels.minReactionsIntraday + 20) errs.push("levels: minReactions is unreasonably high.");
  return errs;
}

export const rulesVersionOf = (overrides: Overrides): string => rulesVersion(buildCfg(overrides));

/** Rows for the editor / diff, grouped by the top-level config key. */
export function paramRows(overrides: Overrides): ParamRow[] {
  const cur = new Map(flatten(buildCfg(overrides)).map((l) => [l.path, l.value]));
  return flatten(DEFAULTS).map(({ path, value: def }) => {
    const value = cur.get(path) ?? def;
    return { path, group: path.split(".")[0] as string, value, def, spec: specFor(path, def), changed: !same(value, def) };
  });
}

export const diffRows = (overrides: Overrides): ParamRow[] => paramRows(overrides).filter((r) => r.changed);