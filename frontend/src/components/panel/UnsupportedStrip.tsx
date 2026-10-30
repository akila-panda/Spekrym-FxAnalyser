/** DX2: one-line stand-in for a row the strategy does not support (or that is too short to draw). No chart instance. */
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Timeframe } from "@/types/market";

interface Props {
  tf: Timeframe;
  /** Short text after the TF, e.g. "not supported by Opening range breakout". */
  label: string;
  /** Full reason shown from the info button. */
  reason: string;
}

export function UnsupportedStrip({ tf, label, reason }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <section
      ref={root}
      className="panel-strip"
      aria-label={`${tf} chart`}
      data-row="collapsed"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) setOpen(false);
      }}
    >
      <strong className="tf-label mono">{tf}</strong>
      <span className="strip-text">· {label}</span>
      <button
        type="button"
        className="strip-info icon-btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Why ${tf} is collapsed`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="info" />
      </button>
      <p id={id} className="strip-reason" role="note" hidden={!open}>
        {reason}
      </p>
    </section>
  );
}