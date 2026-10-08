import { resolveTz } from "@/lib/format";
import { formatInTz } from "@/lib/tz";
import { stepNeighbor } from "@/scan/selectors";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";

/** Replays the setup in order. At step k the charts show only what was known by then. Default: all steps. */
export function StepScrubber({ displayTz }: { displayTz?: string }) {
  const steps = useAnnotationStore((s) => s.steps);
  const step = useAnnotationStore((s) => s.step);
  const setStep = useAnnotationStore((s) => s.setStep);
  const timezone = useViewStore((s) => s.timezone);
  if (steps.length === 0) return null;

  const tz = resolveTz(timezone, displayTz);
  const idx = step === null ? -1 : steps.findIndex((s) => s.n === step);
  const pos = idx + 1; // 0 = all steps
  const current = idx >= 0 ? steps[idx] : undefined;
  const text = current ? `Step ${pos} of ${steps.length}: ${current.label}` : "All steps";

  return (
    <div className="scrubber" role="group" aria-label="Steps">
      <div className="scrubber-row">
        <button type="button" aria-label="Previous step" title="Previous step ([)" onClick={() => setStep(stepNeighbor(steps, step, -1))}>‹</button>
        <input
          type="range" min={0} max={steps.length} step={1} value={pos}
          aria-label="Step" aria-valuetext={text}
          onChange={(e) => {
            const p = Number(e.target.value);
            setStep(p === 0 ? null : (steps[p - 1]?.n ?? null));
          }}
        />
        <button type="button" aria-label="Next step" title="Next step (])" onClick={() => setStep(stepNeighbor(steps, step, 1))}>›</button>
      </div>
      <p className="scrubber-text" role="status">
        <strong>{text}</strong>
        {current && <span className="mono hint"> · known {formatInTz(current.known_at, tz)}</span>}
      </p>
      {step !== null && (
        <button type="button" onClick={() => setStep(null)}>Show all steps</button>
      )}
    </div>
  );
}