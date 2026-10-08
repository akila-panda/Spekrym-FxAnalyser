import { ROLE_LABELS, roleGroup } from "@/annotations/roles";
import { formatInTz } from "@/lib/tz";
import type { Annotation } from "@/types/annotations";

/** Hover readout. Shown in the panel header line, so nothing floats over the candles. */
export function AnnotationTooltip({ annotation: a, tz }: { annotation: Annotation; tz: string }) {
  return (
    <span className="ann-readout" role="status">
      <strong>{a.label ?? ROLE_LABELS[roleGroup(a.role)]}</strong>
      <span className="mono"> {a.source_tf} · known {formatInTz(a.known_at, tz)}</span>
      {a.why && <span> · {a.why}</span>}
    </span>
  );
}