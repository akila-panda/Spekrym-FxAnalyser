import { RailAccordion, type RailSectionDef } from "@/components/layout/RailSection";
import { useRailStore } from "@/components/layout/railStore";
import { resolveTz } from "@/lib/format";
import { selectActiveSetup, useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import { ConditionChecklist } from "./ConditionChecklist";
import { ExplainSetup } from "./ExplainSetup";
import { RejectionBreakdown } from "./RejectionBreakdown";
import { ReviewControls } from "./ReviewControls";
import { ScanAnalytics } from "./ScanAnalytics";
import { SetupHeader } from "./SetupHeader";
import { StepScrubber } from "./StepScrubber";
import { WhatIfEditor } from "./WhatIfEditor";

export function SetupDetail() {
  const setup = useScanStore(selectActiveSetup);
  const active = useScanStore((s) => s.active);
  const panel = useScanStore((s) => (s.active ? s.panels[s.active.tf] : undefined));
  const timezone = useViewStore((s) => s.timezone);
  const open = useRailStore((s) => s.open);
  const setOpen = useRailStore((s) => s.setOpen);

  const analytics: RailSectionDef = {
    id: "analytics",
    title: "Scan analytics",
    content: (
      <>
        <ScanAnalytics bare />
        <RejectionBreakdown />
      </>
    ),
  };

  if (!setup || !active || !panel?.result) {
    return (
      <section className="setup-detail" aria-label="Setup detail">
        <p className="hint detail-empty">Select a setup to see why it qualified or was rejected.</p>
        <RailAccordion label="Scan sections" sections={[analytics]} open={open} onOpenChange={setOpen} />
      </section>
    );
  }
  const strategy = panel.result.strategy;
  const tz = resolveTz(timezone, strategy.display_tz);
  const rejected = setup.status === "rejected";

  const sections: RailSectionDef[] = [
    {
      id: "why",
      title: rejected ? "Why it was rejected" : "Why it qualified",
      content: <ExplainSetup setup={setup} displayTz={strategy.display_tz} />,
    },
    { id: "conditions", title: "Conditions", content: <ConditionChecklist conditions={setup.conditions} /> },
    { id: "whatif", title: "What-if", content: <WhatIfEditor setup={setup} /> },
    { id: "timeline", title: "Timeline", content: <StepScrubber displayTz={strategy.display_tz} /> },
    analytics,
  ];

  return (
    <section className="setup-detail" aria-label="Setup detail">
      <SetupHeader setup={setup} tf={active.tf} strategyName={strategy.name} tz={tz} />
      {panel.stale && <p className="hint">From a stale scan. Inputs changed since it ran.</p>}
      <ReviewControls />
      <RailAccordion label="Setup sections" sections={sections} open={open} onOpenChange={setOpen} />
    </section>
  );
}