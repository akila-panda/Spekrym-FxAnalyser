/** S6: `D › H4 › H1 10:00` with per-level jump and "back". Shown only while drilled. */
import { Icon } from "@/components/ui/Icon";
import { formatCrosshairTime, resolveTz } from "@/lib/format";
import { useViewStore } from "@/store/viewStore";
import "@/styles/stack.css";
import { breadcrumbTrail } from "./drill";
import { useFocusStore } from "./focusStore";
import type { Focus } from "./viewportPolicy";

export function crumbLabel(f: Focus, tz: string, withTime: boolean): string {
  if (!withTime) return f.parentTF;
  const full = formatCrosshairTime(f.interval[0], tz); // "YYYY-MM-DD HH:MM"
  const part = f.parentTF === "D" ? full.slice(5, 10) : full.slice(11, 16);
  return `${f.parentTF} ${part}${f.forming ? " · forming" : ""}`;
}

export function Breadcrumb() {
  const focus = useFocusStore((s) => s.focus);
  const history = useFocusStore((s) => s.history);
  const back = useFocusStore((s) => s.back);
  const backTo = useFocusStore((s) => s.backTo);
  const tz = resolveTz(useViewStore((s) => s.timezone));
  const trail = breadcrumbTrail(focus, history);
  if (trail.length === 0) return null;
  return (
    <nav className="crumbs" aria-label="Drill path">
      <button type="button" className="resnap" onClick={back} aria-label="Back out one level">
        <Icon name="arrow-left" /> back
      </button>
      <ol className="crumb-list mono">
        {trail.map((f, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={f.parentTF}>
              {i > 0 && (
                <span className="crumb-sep" aria-hidden="true">
                  <Icon name="chevron-right" size={10} />
                </span>
              )}
              {last ? (
                <span aria-current="location">{crumbLabel(f, tz, true)}</span>
              ) : (
                <button type="button" className="crumb" onClick={() => backTo(f.drillDepth)} aria-label={`Back to ${f.parentTF}`}>
                  {crumbLabel(f, tz, false)}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}