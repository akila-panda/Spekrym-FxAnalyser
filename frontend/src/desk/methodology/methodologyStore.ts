/** DESK DK17 — methodology store: the active overrides + an append-only version history. Each distinct effective config
 *  has its own rulesVersion; snapshots/decisions keep the rulesVersion they were made under, and `resolve(rv)` recovers the
 *  parameters for any version ever applied. Local only (spekrym.desk.methodology.v1), never replicated. */
import { create } from "zustand";
import { createLocalStore } from "@/desk/lib/storage";
import { rulesVersion } from "@/desk/lib/hash";
import { DEFAULTS } from "./defaults";
import { buildCfg, cleanOverrides, rulesVersionOf, validateConfig, validateParam, type Cfg, type Overrides, type ParamValue } from "./params";

export const MAX_VERSIONS = 50;
export interface VersionRec { rulesVersion: string; overrides: Record<string, ParamValue>; created_at: number; label: string }
interface Persisted { active: Record<string, ParamValue>; versions: VersionRec[] }

export const DEFAULT_RV = rulesVersion(DEFAULTS);

export function parseMethodology(raw: unknown): Persisted {
  const o = (raw && typeof raw === "object" ? raw : {}) as { active?: unknown; versions?: unknown };
  const versions: VersionRec[] = [];
  for (const v of Array.isArray(o.versions) ? o.versions : []) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const overrides = cleanOverrides(r.overrides);
    if (validateConfig(overrides).length) continue;
    versions.push({ rulesVersion: rulesVersionOf(overrides), overrides, created_at: Number.isInteger(r.created_at) ? (r.created_at as number) : 0, label: typeof r.label === "string" ? r.label.slice(0, 80) : "" });
  }
  const active = cleanOverrides(o.active);
  return { active: validateConfig(active).length ? {} : active, versions: versions.slice(-MAX_VERSIONS) };
}

const store = createLocalStore<Persisted>({ name: "methodology", version: 1, parse: parseMethodology, empty: () => ({ active: {}, versions: [] }) });
const initial = store.load();

export type ApplyResult = { ok: true; rulesVersion: string; changed: boolean } | { ok: false; errors: string[] };

interface MethodologyState {
  active: Readonly<Record<string, ParamValue>>;
  versions: readonly VersionRec[];
  /** Applies a complete override set as the active methodology. A new effective config ⇒ a new rulesVersion (recorded once). */
  apply: (overrides: Overrides, label?: string, now?: number) => ApplyResult;
  /** Re-activates a version from history. */
  activate: (rv: string) => boolean;
  /** Back to the shipped defaults (history is kept). */
  reset: () => void;
  clearAll: () => void;
}

export const useMethodologyStore = create<MethodologyState>()((set, get) => ({
  active: initial.active,
  versions: initial.versions,
  apply: (overrides, label = "", now = Math.floor(Date.now() / 1000)) => {
    const errors: string[] = [];
    for (const [p, v] of Object.entries(overrides)) { const e = validateParam(p, v); if (e) errors.push(`${p}: ${e}`); }
    if (errors.length) return { ok: false, errors };
    const clean = cleanOverrides(overrides);
    errors.push(...validateConfig(clean));
    if (errors.length) return { ok: false, errors };
    const rv = rulesVersionOf(clean);
    const changed = rv !== rulesVersionOf(get().active);
    set((s) => ({
      active: clean,
      versions: s.versions.some((v) => v.rulesVersion === rv) ? s.versions : [...s.versions, { rulesVersion: rv, overrides: clean, created_at: now, label: label.slice(0, 80) }].slice(-MAX_VERSIONS),
    }));
    return { ok: true, rulesVersion: rv, changed };
  },
  activate: (rv) => {
    if (rv === DEFAULT_RV) { set({ active: {} }); return true; }
    const v = get().versions.find((x) => x.rulesVersion === rv);
    if (!v) return false;
    set({ active: v.overrides });
    return true;
  },
  reset: () => set({ active: {} }),
  clearAll: () => set({ active: {}, versions: [] }),
}));

useMethodologyStore.subscribe((s, p) => {
  if (s.active === p.active && s.versions === p.versions) return;
  const all: Persisted = { active: s.active as Record<string, ParamValue>, versions: s.versions as VersionRec[] };
  if (!store.save(all)) store.save({ active: all.active, versions: all.versions.slice(Math.floor(all.versions.length / 2)) });
});

export interface ActiveMethodology { cfg: Cfg; rulesVersion: string; overrides: Overrides; isDefault: boolean }
const cache = new WeakMap<object, ActiveMethodology>();

/** Active effective config (memoised per override object). Non-hook; use inside useMemo deps via `useActiveMethodology`. */
export function activeMethodology(overrides: Overrides = useMethodologyStore.getState().active): ActiveMethodology {
  let m = cache.get(overrides);
  if (!m) { const cfg = buildCfg(overrides); m = { cfg, rulesVersion: rulesVersion(cfg), overrides, isDefault: Object.keys(overrides).length === 0 }; cache.set(overrides, m); }
  return m;
}

export function useActiveMethodology(): ActiveMethodology {
  return activeMethodology(useMethodologyStore((s) => s.active));
}

/** Parameters under which a rulesVersion was produced (defaults, or an applied version), else null. */
export function resolveRulesVersion(rv: string, versions: readonly VersionRec[] = useMethodologyStore.getState().versions): Overrides | null {
  if (rv === DEFAULT_RV) return {};
  return versions.find((v) => v.rulesVersion === rv)?.overrides ?? null;
}