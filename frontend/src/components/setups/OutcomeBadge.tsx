import type { Outcome } from "@/types";
import { formatR } from "@/scan/selectors";

interface Props {
  status: "valid" | "rejected";
  outcome?: Outcome;
}

const MARK = { win: "✓", loss: "✕", flat: "–" } as const;

/** Result and R, net of cost. The mark carries the meaning without colour. */
export function OutcomeBadge({ status, outcome }: Props) {
  if (status === "rejected" || !outcome) return <span className="outcome mono" data-result="rejected">rejected</span>;
  return (
    <span className="outcome mono" data-result={outcome.result} title="R multiple, net of cost">
      {formatR(outcome.r_multiple)} <span aria-label={outcome.result}>{MARK[outcome.result]}</span>
    </span>
  );
}