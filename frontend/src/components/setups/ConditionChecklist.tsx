import type { Condition } from "@/types";

const MARK = { true: "☑", false: "☒", null: "◇" } as const;
const WORD = { true: "passed", false: "failed", null: "not applicable" } as const;

/** Each rule: passed, failed or not applicable, with the backend's detail text. */
export function ConditionChecklist({ conditions }: { conditions: readonly Condition[] }) {
  if (conditions.length === 0) return <p className="hint">This setup has no recorded conditions.</p>;
  return (
    <ul className="checklist" aria-label="Conditions">
      {conditions.map((c) => {
        const k = String(c.passed) as "true" | "false" | "null";
        return (
          <li key={c.key} data-passed={k}>
            <span className="mark" aria-hidden="true">{MARK[k]}</span>
            <span>
              {c.label}
              <span className="sr-only"> {WORD[k]}</span>
              {c.detail && <span className="hint"> {c.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}