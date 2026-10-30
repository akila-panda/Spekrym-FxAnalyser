import { resolveTz } from "@/lib/format";
import { formatInTz } from "@/lib/tz";
import { useEvidenceStore } from "@/stack/evidenceStore";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import type { Condition, Setup, Step } from "@/types";
import "@/styles/explain.css";

export interface ExplainRow {
  step: Step;
  /** Number of annotations drawn for this step. */
  marks: number;
}

/** Steps in causal order (known_at, then n), each with its annotation count. Pure. */
export function buildExplainChain(setup: Pick<Setup, "steps" | "annotations">): ExplainRow[] {
  return [...setup.steps]
    .sort((a, b) => a.known_at - b.known_at || a.n - b.n)
    .map((step) => ({ step, marks: setup.annotations.filter((a) => a.step === step.n).length }));
}

const MARK = { true: "✓", false: "×", null: "◇" } as const;
const WORD = { true: "passed", false: "failed", null: "not applicable" } as const;

/** Failed conditions first, then passed, then not applicable. Pure. */
export function orderConditions(cs: readonly Condition[]): Condition[] {
  const rank = (c: Condition) => (c.passed === false ? 0 : c.passed === null ? 2 : 1);
  return [...cs].sort((a, b) => rank(a) - rank(b));
}

/** E6: the causal story of a setup, from existing conditions + steps + known_at. View only. */
export function ExplainSetup({ setup, displayTz }: { setup: Setup; displayTz?: string }) {
  const timezone = useViewStore((s) => s.timezone);
  const step = useAnnotationStore((s) => s.step);
  const setStep = useAnnotationStore((s) => s.setStep);
  const linked = useEvidenceStore((s) => s.hoverStep);
  const setLinked = useEvidenceStore((s) => s.setHover);
  const tz = resolveTz(timezone, displayTz);
  const chain = buildExplainChain(setup);
  const rejected = setup.status === "rejected";

  return (
    <section className="explain" aria-label="Explain this setup">
      <div className="explain-head">
        <span className="rail-section-title">{rejected ? "Why this was rejected" : "Why this qualified"}</span>
        <span className="pill mono">exploratory</span>
      </div>

      {chain.length === 0 ? (
        <p className="hint">No recorded steps for this setup.</p>
      ) : (
        <ol className="explain-chain" aria-label="Causal steps">
          {chain.map(({ step: s, marks }) => (
            <li key={s.n} data-active={step === s.n ? "true" : "false"} data-linked={linked === s.n ? "true" : "false"}>
              <button
                type="button"
                className="explain-row"
                aria-pressed={step === s.n}
                aria-label={`Step ${s.n}: ${s.label}, known ${formatInTz(s.known_at, tz)}. Show the chart as of this step`}
                onClick={() => setStep(step === s.n ? null : s.n)}
                onMouseEnter={() => setLinked(s.n)}
                onMouseLeave={() => setLinked(null)}
                onFocus={() => setLinked(s.n)}
                onBlur={() => setLinked(null)}
              >
                <span aria-hidden="true" className="explain-n mono">{s.n}</span>
                <span className="pill mono explain-time">{formatInTz(s.known_at, tz).slice(-5)}</span>
                <span className="explain-label">{s.label}</span>
                {marks > 0 && <span className="hint mono explain-marks">{marks} mark{marks === 1 ? "" : "s"}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}

      {setup.conditions.length > 0 && (
        <ul className="explain-conds" aria-label="Condition outcomes">
          {orderConditions(setup.conditions).map((c) => {
            const k = String(c.passed) as "true" | "false" | "null";
            return (
              <li key={c.key} data-passed={k}>
                <span aria-hidden="true" className="mono">{MARK[k]}</span>
                <span>
                  {c.label}
                  <span className="sr-only"> {WORD[k]}</span>
                  {c.detail && <span className="hint"> {c.detail}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}