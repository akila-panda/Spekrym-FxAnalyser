/** DESK DK14 — original thesis (frozen snapshot, shown unchanged) beside "what changed since". Pure. */
import { describeObject } from "@/desk/evidence/describe";
import type { Snapshot } from "@/desk/types/schemas";
import type { FeedEvent } from "./changeFeed";

export interface ThesisView {
  saved: boolean;
  savedAt: number | null;
  dataKind: "sample" | "live" | null;
  lines: string[];
  notes: string;
  /** Events known after the snapshot; those touching an accepted object first. */
  since: FeedEvent[];
}

export function buildThesis(snaps: readonly Snapshot[], events: readonly FeedEvent[]): ThesisView {
  const s = [...snaps].sort((a, b) => b.created_at - a.created_at)[0];
  if (!s) return { saved: false, savedAt: null, dataKind: null, lines: [], notes: "", since: [] };
  const accepted = new Set(s.acceptedIds);
  const since = events.filter((e) => e.t > s.as_of).sort((a, b) => Number(accepted.has(b.objectId)) - Number(accepted.has(a.objectId)) || b.t - a.t);
  return {
    saved: true, savedAt: s.as_of, dataKind: s.dataKind, notes: s.notes ?? "", since,
    lines: s.objects.filter((o) => accepted.has(o.id)).map((o) => describeObject(o, "headline").headline),
  };
}