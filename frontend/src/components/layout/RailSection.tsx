/** DX3: accordion for the right rail. One section open at a time; headers are real buttons. */
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export interface RailSectionDef {
  id: string;
  title: string;
  content: ReactNode;
}

interface Props {
  sections: readonly RailSectionDef[];
  /** Open section id, or null. An id that is not in `sections` counts as none open. */
  open: string | null;
  onOpenChange: (id: string | null) => void;
  label: string;
}

export function RailAccordion({ sections, open, onOpenChange, label }: Props) {
  const uid = useId();
  const heads = useRef<(HTMLButtonElement | null)[]>([]);
  const current = sections.some((s) => s.id === open) ? open : null;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = sections.length;
    let to = -1;
    if (e.key === "ArrowDown") to = (i + 1) % n;
    else if (e.key === "ArrowUp") to = (i - 1 + n) % n;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = n - 1;
    if (to < 0) return;
    e.preventDefault();
    heads.current[to]?.focus();
  };

  return (
    <div className="rail-accordion" role="group" aria-label={label}>
      {sections.map((s, i) => {
        const isOpen = s.id === current;
        const headId = `${uid}-h-${s.id}`;
        const bodyId = `${uid}-b-${s.id}`;
        return (
          <section key={s.id} className="rail-section" data-open={isOpen}>
            <div role="heading" aria-level={3} className="rail-section-head">
              <button
                type="button"
                id={headId}
                ref={(el) => {
                  heads.current[i] = el;
                }}
                aria-expanded={isOpen}
                aria-controls={isOpen ? bodyId : undefined}
                onClick={() => onOpenChange(isOpen ? null : s.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <span aria-hidden="true" className="rail-caret"><Icon name={isOpen ? "caret-down" : "caret-right"} size={12} /></span> {s.title}
              </button>
            </div>
            {isOpen && (
              <div id={bodyId} role="region" aria-labelledby={headId} className="rail-section-body">
                {s.content}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}