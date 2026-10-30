import { useState } from "react";
import { useScanStore } from "@/scan/scanStore";
import "@/styles/chrome.css";

export type GuideStep = 1 | 2 | 3 | null;

/** Which first-run step is current. Null once a setup is selected. Pure. */
export function guideStep(hasStrategy: boolean, hasResults: boolean, hasActive: boolean): GuideStep {
  if (hasActive) return null;
  if (!hasStrategy) return 1;
  if (!hasResults) return 2;
  return 3;
}

const STEPS = ["Pick a strategy", "Scan", "Select a setup"] as const;

export function EmptyStage() {
  const strategyId = useScanStore((s) => s.strategyId);
  const hasResults = useScanStore((s) => Object.values(s.panels).some((p) => p.result !== undefined));
  const hasActive = useScanStore((s) => s.active !== null);
  const [hidden, setHidden] = useState(false);
  const step = guideStep(strategyId !== null, hasResults, hasActive);
  if (hidden || step === null) return null;
  return (
    <div className="empty-stage">
      <section className="empty-card" aria-label="Getting started">
        <h2>Getting started</h2>
        <ol className="empty-steps">
          {STEPS.map((label, i) => {
            const n = i + 1;
            return (
              <li key={label} aria-current={step === n ? "step" : undefined} data-done={n < step}>
                <span className="n" aria-hidden="true">{n}</span>
                {label}
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={() => setHidden(true)}>Hide guide</button>
      </section>
    </div>
  );
}