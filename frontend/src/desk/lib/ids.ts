/** DESK DK0 — stable object identity. id = type:pair:tf:anchorTimes (price excluded, so a small
 *  recalculation keeps the id). Methodology changes alter rulesVersion, not id. */
import type { ObjectType } from "@/desk/types/schemas";

export function objectId(input: {
  type: ObjectType;
  pair: string;
  tf: string;
  anchorTimes: readonly number[];
}): string {
  const anchors = [...input.anchorTimes].map((t) => Math.trunc(t)).join("-");
  return `${input.type}:${input.pair}:${input.tf}:${anchors}`;
}

/** Relation id is order-independent in its endpoints. */
export function relationId(kind: string, aId: string, bId: string): string {
  const [x, y] = [aId, bId].sort();
  return `relation:${kind}:${x}:${y}`;
}
