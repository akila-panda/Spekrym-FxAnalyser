/** DESK DK6 — Prepare session: detects each W…M1 step on the deep sample series (closed bars only, one as-of path),
 *  builds inbox + checklist, publishes them (and the current step's objects for the evidence drawer), and binds the
 *  Prepare keys: [ ] step · J K inbox · Y N R triage · U undo. Never fires while typing. */
import { useEffect, useMemo, useState } from "react";
import { buildRelations, detectAll, useAnalysisStore } from "@/desk/detect";
import { decisionsForDay, useDecisionStore } from "@/desk/decisions/decisionStore";
import { useActiveMethodology } from "@/desk/methodology/methodologyStore";
import { deepCandles } from "@/desk/mock/deepMock";
import type { AnalysisObject } from "@/desk/types/schemas";
import { isTyping } from "@/desk/workspace/useDeskKeys";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { utcDateString } from "@/lib/time";
import { useViewStore } from "@/store/viewStore";
import { cursorBy, stepBy, triage, undo } from "./actions";
import { buildChecklist } from "./checklist";
import { customObject } from "./customLevel";
import { draftKey, emptyDraft, usePrepareStore, type PrepareView } from "./prepareStore";
import { buildInbox, STEPS, type InboxItem, type Step } from "./walk";

/** Prepare runs on the deep mock only until a live DeskSource exists (DK0 DeskSource.getCandles is a stub). */
export const PREPARE_DATA_KIND = "sample" as const;

export function usePrepareSession(): void {
  const pair = useViewStore((s) => s.pair);
  const asOfSel = useDeskUiStore((s) => s.asOf);
  const decisions = useDecisionStore((s) => s.decisions);
  const drafts = usePrepareStore((s) => s.drafts);
  const step = usePrepareStore((s) => s.step);
  const cursor = usePrepareStore((s) => s.cursor);
  const [ready, setReady] = useState(false);
  const meth = useActiveMethodology();
  const rv = meth.rulesVersion;

  // Let the first paint show a skeleton; detection runs right after.
  useEffect(() => { const t = setTimeout(() => setReady(true), 0); return () => clearTimeout(t); }, []);

  const detected = useMemo(() => {
    if (!ready) return null;
    const asOf = asOfSel === "latest" ? Infinity : asOfSel;
    const by = {} as Record<Step, AnalysisObject[]>;
    let last = 0;
    for (const tf of STEPS) {
      const candles = deepCandles(pair, tf);
      const lastBar = candles[candles.length - 1];
      const r = detectAll({ candles, pair, tf, asOf, dataKind: PREPARE_DATA_KIND, dataVersion: `${candles.length}:${lastBar?.time ?? 0}` }, meth.cfg);
      by[tf] = r.objects;
      last = Math.max(last, r.lastClose ?? 0);
    }
    return { by, asOf: asOfSel === "latest" ? last : Math.min(asOfSel, last || asOfSel) };
  }, [ready, pair, asOfSel, meth]);

  const date = detected ? utcDateString(detected.asOf) : "";
  const draft = (detected && drafts[draftKey(pair, date)]) || emptyDraft();

  const view = useMemo<PrepareView | null>(() => {
    if (!detected) return null;
    const dec = decisionsForDay(decisions, pair, date);
    const customs = draft.customs.map((c) => customObject(c, rv, PREPARE_DATA_KIND));
    const inbox = {} as Record<Step, InboxItem[]>;
    for (const s of STEPS) inbox[s] = buildInbox(detected.by[s], customs, s, detected.asOf, dec);
    return { pair, date, asOf: detected.asOf, rulesVersion: rv, dataKind: PREPARE_DATA_KIND, inbox, checklist: buildChecklist(inbox, draft.reviewed) };
  }, [detected, decisions, draft, pair, date, rv]);

  useEffect(() => {
    usePrepareStore.getState().setView(view);
    return () => usePrepareStore.getState().setView(null);
  }, [view]);

  // Feed the evidence drawer with the current step's candidates (already as-of folded).
  useEffect(() => {
    const items = view?.inbox[step] ?? [];
    const objects = items.map((i) => i.object);
    useAnalysisStore.getState().setAnalysis({ objects, relations: buildRelations(objects), projected: new Set<string>(), dataKind: PREPARE_DATA_KIND, viewTf: step });
    useDeskUiStore.getState().select(items[cursor]?.object.id ?? null);
  }, [view, step, cursor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const run: Record<string, () => void> = {
        "[": () => stepBy(-1), "]": () => stepBy(1), j: () => cursorBy(1), k: () => cursorBy(-1),
        y: () => triage("accept"), n: () => triage("reject"), r: () => triage("revisit"), u: undo,
      };
      const fn = run[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (fn) { fn(); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}