import type { ParamDef, ParamValue } from "@/types";
import { isChanged, type ParamValues } from "./paramState";

export interface SummaryPart {
  key: string;
  text: string;
  changed: boolean;
}

export interface ParamSummaryModel {
  parts: SummaryPart[];
  /** Params not shown in `parts`. */
  more: number;
  /** Params edited away from their default (all of them, shown or not). */
  changed: number;
}

const withUnit = (v: string, unit?: string): string => (!unit ? v : unit.length <= 2 ? `${v}${unit}` : `${v} ${unit}`);

export function formatParamValue(def: ParamDef, value: ParamValue | undefined): string {
  const v = value ?? def.default;
  if (def.type === "boolean") return v === true ? def.label : `${def.label}: off`;
  if (def.type === "number" || def.type === "integer") return withUnit(String(v).trim(), def.unit);
  return String(v);
}

/** One-line view of the parameters. Edited values are shown first so a change is never hidden. */
export function summarizeParams(defs: readonly ParamDef[], values: ParamValues, max = 4): ParamSummaryModel {
  const all: SummaryPart[] = defs.map((d) => ({
    key: d.key,
    text: formatParamValue(d, values[d.key]),
    changed: isChanged(d, values[d.key]),
  }));
  const picked = new Set([...all.filter((p) => p.changed), ...all.filter((p) => !p.changed)].slice(0, max).map((p) => p.key));
  const parts = all.filter((p) => picked.has(p.key));
  return { parts, more: all.length - parts.length, changed: all.filter((p) => p.changed).length };
}

/** A group is open before the first scan, folded after it, unless the user chose. */
export const groupOpen = (explicit: boolean | null, hasScanned: boolean): boolean => explicit ?? !hasScanned;