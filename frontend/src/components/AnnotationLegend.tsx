import { useMemo } from "react";
import { GROUP_ORDER, ROLE_LABELS, roleGroup, roleVar } from "@/annotations/roles";
import { useAnnotationStore } from "@/store/annotationStore";
import { PANEL_ORDER, type Timeframe } from "@/types/market";

/** Left-rail legend: one row per role group, with a colour chip, the timeframes it comes from, and a toggle. */
export function AnnotationLegend() {
  const annotations = useAnnotationStore((s) => s.annotations);
  const hidden = useAnnotationStore((s) => s.hiddenGroups);
  const toggle = useAnnotationStore((s) => s.toggleGroup);

  const rows = useMemo(() => {
    const m = new Map<string, { count: number; tfs: Set<Timeframe>; cssVar: string }>();
    for (const a of annotations) {
      const g = roleGroup(a.role);
      const r = m.get(g) ?? { count: 0, tfs: new Set<Timeframe>(), cssVar: roleVar(a.role, a.tone) };
      r.count += 1;
      r.tfs.add(a.source_tf);
      m.set(g, r);
    }
    return GROUP_ORDER.flatMap((g) => {
      const r = m.get(g);
      return r ? [{ group: g, ...r, tfs: PANEL_ORDER.filter((t) => r.tfs.has(t)) }] : [];
    });
  }, [annotations]);

  if (rows.length === 0) return <p>Legend toggles appear after a scan.</p>;

  return (
    <ul className="legend-list" aria-label="Annotation layers">
      {rows.map((r) => (
        <li key={r.group}>
          <label className="legend-row">
            <input type="checkbox" checked={!hidden.has(r.group)} onChange={() => toggle(r.group)} aria-label={ROLE_LABELS[r.group]} />
            <span className="role-chip" style={{ background: `var(${r.cssVar})` }} aria-hidden="true" />
            <span className="legend-name">{ROLE_LABELS[r.group]}</span>
            <span className="legend-meta mono">
              {r.tfs.join(" ")} · {r.count}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}