/** DESK DK6 — widget id → body component. Ids without an entry show the "sample" stub in WidgetFrame. */
import type { ComponentType } from "react";
import { BriefBody } from "@/desk/brief/BriefBody";
import { ChangeFeedBody, ReadinessBody } from "@/desk/live/LiveWidgets";
import { CalendarBody, SessionsBody, VolatilityBody } from "@/desk/context/ContextWidgets";
import { JournalBody, PlanBody } from "@/desk/plan/PlanWidgets";
import { MethodologyBody } from "@/desk/methodology/MethodologyEditor";
import { ConfluenceBody } from "@/desk/confluence/ConfluenceBody";
import { EvidenceBody } from "@/desk/evidence/EvidenceDrawer";
import { LayersPanel } from "@/desk/layers/LayersPanel";
import { EvidenceTimelineBody, ReplayBody } from "@/desk/replay/ReplayWidgets";
import { ScorecardBody } from "@/desk/scorecard/ScorecardWidget";
import { ChecklistBody, InboxBody } from "@/desk/prepare/PrepareWidgets";

export const WIDGET_BODIES: Record<string, ComponentType> = {
  layers: LayersPanel, evidence: EvidenceBody, checklist: ChecklistBody, levelsInbox: InboxBody, confluence: ConfluenceBody, brief: BriefBody, changeFeed: ChangeFeedBody, readiness: ReadinessBody,
  calendar: CalendarBody, sessions: SessionsBody, volatility: VolatilityBody,
  plan: PlanBody, journal: JournalBody, methodology: MethodologyBody,
  scorecard: ScorecardBody, replay: ReplayBody, evidenceTimeline: EvidenceTimelineBody,
};