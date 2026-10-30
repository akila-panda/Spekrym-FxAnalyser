import { PAIRS, type Pair } from "@/types/market";
import type { TimezoneMode } from "@/lib/format";
import { isMode, type Mode } from "@/components/layout/modes";
import type { Layout } from "@/panels/layouts";
import type { ParamValue } from "@/types";

/** The shareable slice of workbench state encoded in the URL query string. */
export interface ShareState {
  pair?: Pair;
  tz?: TimezoneMode;
  linked?: boolean;
  layout?: Layout;
  /** DX10: workbench mode. Omitted when it is the default. */
  mode?: Mode;
  /** DESK DK1: app-level switch. Omitted when "scan" (the default). */
  app?: "desk";
  deskArea?: "my" | "analysis";
  wf?: "prepare" | "live" | "review";
  strategy?: string;
  from?: string;
  to?: string;
  params?: Record<string, ParamValue>;
  /** F10: deep link to one trade (journal window). Additive; malformed ids are dropped. */
  trade?: string;
  /** F15: deep link to one experiment (evidence). Additive; malformed ids are dropped. */
  experiment?: string;
}

const EXP_ID = /^[A-Za-z0-9:_.-]{1,80}$/;
const TRADE_ID = /^[A-Za-z0-9:_.-]{1,80}$/;
const TZ: readonly TimezoneMode[] = ["utc", "local", "strategy"];
const LAYOUTS: readonly Layout[] = ["grid", "focus", "maximized", "stack"];
const isDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s;
};

/** Serialises state to a query string (no leading `?`). Omits absent fields; `p.<key>` carries each param. */
export function encodeState(s: ShareState): string {
  const q = new URLSearchParams();
  if (s.pair) q.set("pair", s.pair);
  if (s.tz) q.set("tz", s.tz);
  if (s.linked !== undefined) q.set("linked", s.linked ? "1" : "0");
  if (s.layout) q.set("layout", s.layout);
  if (s.mode) q.set("mode", s.mode);
  if (s.app) q.set("app", s.app);
  if (s.deskArea) q.set("desk", s.deskArea);
  if (s.wf) q.set("wf", s.wf);
  if (s.strategy) q.set("strategy", s.strategy);
  if (s.from) q.set("from", s.from);
  if (s.to) q.set("to", s.to);
  for (const [k, v] of Object.entries(s.params ?? {})) q.set(`p.${k}`, String(v));
  if (s.trade) q.set("trade", s.trade);
  if (s.experiment) q.set("experiment", s.experiment);
  return q.toString();
}

/** Parses a query string into validated state. Unknown or malformed values are dropped, never thrown. */
export function decodeState(query: string): ShareState {
  const q = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const out: ShareState = {};
  const pair = q.get("pair");
  if (pair && (PAIRS as readonly string[]).includes(pair)) out.pair = pair as Pair;
  const tz = q.get("tz");
  if (tz && TZ.includes(tz as TimezoneMode)) out.tz = tz as TimezoneMode;
  const linked = q.get("linked");
  if (linked === "1" || linked === "0") out.linked = linked === "1";
  const layout = q.get("layout");
  if (layout && LAYOUTS.includes(layout as Layout)) out.layout = layout as Layout;
  const mode = q.get("mode");
  if (isMode(mode)) out.mode = mode;
  if (q.get("app") === "desk") out.app = "desk";
  const desk = q.get("desk");
  if (desk === "my" || desk === "analysis") out.deskArea = desk;
  const wf = q.get("wf");
  if (wf === "prepare" || wf === "live" || wf === "review") out.wf = wf;
  const strategy = q.get("strategy");
  if (strategy) out.strategy = strategy;
  const from = q.get("from");
  if (from && isDate(from)) out.from = from;
  const to = q.get("to");
  if (to && isDate(to)) out.to = to;
  const trade = q.get("trade");
  if (trade && TRADE_ID.test(trade)) out.trade = trade;
  const experiment = q.get("experiment");
  if (experiment && EXP_ID.test(experiment)) out.experiment = experiment;
  const params: Record<string, ParamValue> = {};
  for (const [k, v] of q.entries()) {
    if (!k.startsWith("p.")) continue;
    const key = k.slice(2);
    if (!key) continue;
    const n = Number(v);
    params[key] = v.trim() !== "" && !Number.isNaN(n) ? n : v;
  }
  if (Object.keys(params).length > 0) out.params = params;
  return out;
}