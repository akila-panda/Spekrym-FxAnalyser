/** DESK DK0 — deterministic canonical hashing for rulesVersion / dataVersion.
 *  Pure, dependency-free. Sorted-key JSON → FNV-1a 32-bit → base36. Same input ⇒ same hash. */

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export function canonicalHash(value: unknown): string {
  const s = canonical(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Short, stable version stamp for a set of methodology params. */
export function rulesVersion(params: unknown): string {
  return `r${canonicalHash(params)}`;
}
