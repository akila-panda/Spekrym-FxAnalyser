/** DESK DK14 — Live session: Change Feed events, readiness chain and thesis-vs-changes, from the one Brief session. */
import { useMemo } from "react";
import { useBriefSession } from "@/desk/brief/useBrief";
import { useAnalysisStore } from "@/desk/detect/analysisStore";
import { buildRelations } from "@/desk/detect/relations";
import { useSnapshotStore, snapshotsForDay } from "@/desk/prepare/snapshotStore";
import type { AnalysisObject } from "@/desk/types/schemas";
import { utcDateString } from "@/lib/time";
import { buildFeed, type FeedEvent } from "./changeFeed";
import { buildReadiness, type Readiness } from "./readiness";
import { buildThesis, type ThesisView } from "./thesis";

export interface LiveSession { events: FeedEvent[]; readiness: Readiness; thesis: ThesisView; ref: number; dataKind: "sample" | "live"; objects: readonly AnalysisObject[] }

export function useLive(): LiveSession | null {
  const session = useBriefSession();
  const snaps = useSnapshotStore((s) => s.snapshots);
  return useMemo(() => {
    if (!session) return null;
    const events = buildFeed({ pair: session.pair, objects: session.objects, ref: session.ref, price: session.price, atr: session.atr, acceptedIds: session.acceptedIds });
    const focus = session.brief.evidence.find((o) => o.id === session.brief.focusId) ?? null;
    const readiness = buildReadiness({ pair: session.pair, focus, objects: session.objects, ref: session.ref, price: session.price, atr: session.atr });
    const thesis = buildThesis(snapshotsForDay(snaps, session.pair, utcDateString(session.ref)), events);
    return { events, readiness, thesis, ref: session.ref, dataKind: session.brief.dataKind, objects: session.objects };
  }, [session, snaps]);
}

/** Opens an object in the evidence drawer from a Live widget: publishes it to analysisStore, then selection is the caller's. */
export function showObject(objects: readonly AnalysisObject[], id: string, dataKind: "sample" | "live"): void {
  const o = objects.find((x) => x.id === id);
  if (!o) return;
  useAnalysisStore.getState().setAnalysis({ objects: [o], relations: buildRelations([o]), projected: new Set<string>(), dataKind, viewTf: o.source_tf });
}