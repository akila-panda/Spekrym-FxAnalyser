import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Timeframe } from "@/types/market";
import { PopoutButton } from "@/window/PopoutButton";

export type ChipState = "idle" | "scanning" | "done" | "stale" | "unsupported" | "error";

/** Shapes carry the meaning, so state reads without colour. */
export function ChipShape({ state }: { state: ChipState }) {
  const c = state === "scanning" ? "var(--accent)" : state === "done" ? "var(--text)" : "var(--muted)";
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="chip-shape">
      {state === "idle" && <circle cx="4" cy="4" r="3" fill="none" stroke={c} />}
      {state === "scanning" && (
        <>
          <circle cx="4" cy="4" r="3" fill="none" stroke={c} />
          <path d="M4 1a3 3 0 0 1 0 6z" fill={c} />
        </>
      )}
      {state === "done" && <circle cx="4" cy="4" r="3.5" fill={c} />}
      {state === "stale" && (
        <>
          <circle cx="4" cy="4" r="3" fill={c} />
          <path d="M1 7L7 1" stroke="var(--panel)" strokeWidth="1.5" />
        </>
      )}
      {(state === "unsupported" || state === "error") && <path d="M1 1L7 7M7 1L1 7" stroke={c} strokeWidth="1.2" />}
    </svg>
  );
}

interface Props {
  tf: Timeframe;
  state?: ChipState;
  /** Text after the shape, e.g. "14" or "stale". */
  chipText?: string;
  legend?: ReactNode;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  onScan?: () => void;
  /** Why Scan is unavailable, shown as the tooltip. Omit when Scan is available. */
  scanDisabledReason?: string;
  /** When true, this chart shows only its own annotations (higher-timeframe context hidden). */
  localOnly?: boolean;
  onToggleLocalOnly?: () => void;
  /** DX4: Context / Focus / Detail relative to the selected setup (stack only). */
  caption?: string | null;
}

export function PanelHeader({
  tf, state = "idle", chipText, legend, maximized = false, onToggleMaximize, onScan, scanDisabledReason,
  localOnly = false, onToggleLocalOnly, caption,
}: Props) {
  return (
    <header className="panel-header" onDoubleClick={onToggleMaximize}>
      <strong className="tf-label">{tf}</strong>
      {caption && <span className="row-caption">{caption}</span>}
      <span className="chip mono">
        <ChipShape state={state} />
        {chipText ?? state}
      </span>
      <span className="legend-slot">{legend}</span>
      {onToggleLocalOnly && (
        <button
          type="button"
          className="icon-btn"
          aria-pressed={localOnly}
          onClick={onToggleLocalOnly}
          aria-label={`${localOnly ? "Show" : "Hide"} higher-timeframe context on ${tf}`}
          title={localOnly ? "Local only — higher-timeframe context hidden" : "Context flows down — showing higher-timeframe annotations"}
        >
          <Icon name={localOnly ? "layers-off" : "layers"} />
        </button>
      )}
      <button
        type="button"
        className="primary"
        aria-label={`Scan ${tf}`}
        disabled={!onScan || scanDisabledReason !== undefined}
        title={scanDisabledReason ?? `Scan ${tf}`}
        onClick={onScan}
      >
        Scan
      </button>
      {state === "scanning" && <span className="panel-progress" role="progressbar" aria-label={`Scanning ${tf}`} />}
      <PopoutButton role={{ kind: "chart", tf }} label={`${tf} chart`} />
      {onToggleMaximize && (
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleMaximize}
          aria-label={`${maximized ? "Restore" : "Maximize"} ${tf}`}
          title={maximized ? "Restore (Esc)" : "Maximize (M)"}
        >
          <Icon name={maximized ? "restore" : "maximize"} />
        </button>
      )}
    </header>
  );
}