import type { DataSlice, Envelope } from "./protocol";

export interface Stamp {
  revision: number;
  origin: string;
}

/** Higher revision wins; equal revisions tie-break on origin (lexicographically higher wins). 0 = identical. */
export function compareStamp(a: Stamp, b: Stamp): number {
  if (a.revision !== b.revision) return a.revision > b.revision ? 1 : -1;
  if (a.origin === b.origin) return 0;
  return a.origin > b.origin ? 1 : -1;
}

export const shouldApply = (current: Stamp | undefined, incoming: Stamp): boolean =>
  current === undefined || compareStamp(incoming, current) > 0;

export interface Revisions {
  stamp(slice: DataSlice): Stamp | undefined;
  /** Stamp for a new local mutation: one above the highest seen for the slice. */
  next(slice: DataSlice): Stamp;
  /** Records the incoming stamp if it wins. False for losers, duplicates and `all`. */
  accept(env: Pick<Envelope, "slice" | "revision" | "origin">): boolean;
}

export function createRevisions(self: string): Revisions {
  const map = new Map<DataSlice, Stamp>();
  return {
    stamp: (slice) => map.get(slice),
    next(slice) {
      const st: Stamp = { revision: (map.get(slice)?.revision ?? 0) + 1, origin: self };
      map.set(slice, st);
      return st;
    },
    accept(env) {
      const slice = env.slice;
      if (slice === "all") return false;
      const incoming: Stamp = { revision: env.revision, origin: env.origin };
      if (!shouldApply(map.get(slice), incoming)) return false;
      map.set(slice, incoming);
      return true;
    },
  };
}