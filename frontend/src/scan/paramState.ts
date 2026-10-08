import type { ParamDef, ParamValue } from "@/types";

/** Form values. Numeric fields may hold the raw text while the user types. */
export type ParamValues = Record<string, ParamValue>;
export type ParamErrors = Record<string, string>;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function defaultValues(defs: readonly ParamDef[]): ParamValues {
  const out: ParamValues = {};
  for (const d of defs) out[d.key] = d.default;
  return out;
}

const toNumber = (v: ParamValue): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

/** Returns a message saying what is wrong and what to do, or null when valid. */
export function validateParam(def: ParamDef, value: ParamValue | undefined): string | null {
  const v = value ?? def.default;
  switch (def.type) {
    case "number":
    case "integer": {
      const n = toNumber(v);
      if (!Number.isFinite(n)) return `${def.label} needs a number.`;
      if (def.type === "integer" && !Number.isInteger(n)) return `${def.label} must be a whole number.`;
      if (def.min !== undefined && def.max !== undefined && (n < def.min || n > def.max)) {
        return `${def.label} must be between ${def.min} and ${def.max}.`;
      }
      if (def.min !== undefined && n < def.min) return `${def.label} must be at least ${def.min}.`;
      if (def.max !== undefined && n > def.max) return `${def.label} must be at most ${def.max}.`;
      return null;
    }
    case "boolean":
      return typeof v === "boolean" ? null : `${def.label} must be on or off.`;
    case "select":
      return typeof v === "string" && def.options.includes(v) ? null : `Choose one of: ${def.options.join(", ")}.`;
    case "time":
      return typeof v === "string" && HM.test(v) ? null : `${def.label} must be a time as HH:MM.`;
  }
}

export function validateAll(defs: readonly ParamDef[], values: ParamValues): ParamErrors {
  const errors: ParamErrors = {};
  for (const d of defs) {
    const e = validateParam(d, values[d.key]);
    if (e) errors[d.key] = e;
  }
  return errors;
}

export function isChanged(def: ParamDef, value: ParamValue | undefined): boolean {
  const v = value ?? def.default;
  if (def.type === "number" || def.type === "integer") {
    const n = toNumber(v);
    return !(Number.isFinite(n) && n === def.default);
  }
  return v !== def.default;
}

/** Keys whose value differs from the strategy default. */
export function changedKeys(defs: readonly ParamDef[], values: ParamValues): Set<string> {
  return new Set(defs.filter((d) => isChanged(d, values[d.key])).map((d) => d.key));
}

export function resetOne(defs: readonly ParamDef[], values: ParamValues, key: string): ParamValues {
  const d = defs.find((x) => x.key === key);
  return d ? { ...values, [key]: d.default } : values;
}

export const resetAll = defaultValues;

/** Request payload: numeric text becomes numbers. Call only after `validateAll` is clean. */
export function toRequestParams(defs: readonly ParamDef[], values: ParamValues): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const d of defs) {
    const v = values[d.key] ?? d.default;
    out[d.key] = d.type === "number" || d.type === "integer" ? toNumber(v) : v;
  }
  return out;
}