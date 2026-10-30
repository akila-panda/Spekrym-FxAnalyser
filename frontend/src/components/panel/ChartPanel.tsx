import { useMemo, useRef, useState } from "react";
import type { DataSource } from "@/api/dataSource";
import type { ChartApi } from "@/chart/chartApi";
import { ChartCanvas, type OhlcBar } from "@/chart/ChartCanvas";
import { DevAnnotationDemo } from "@/annotations/DevAnnotationDemo";
import { buildPins } from "@/annotations/setupPins";
import { useActiveFocus, usePanelAnnotations } from "@/annotations/usePanelAnnotations";
import { AnnotationTooltip } from "@/components/AnnotationTooltip";
import { useCandles } from "@/hooks/useCandles";
import { resolveTz } from "@/lib/format";
import { usePanelStore } from "@/panels/panelStore";
import { scanPanel } from "@/scan/scanRunner";
import { panelChip, panelNote, selectStrategyDef, useScanStore } from "@/scan/scanStore";
import { useViewStore } from "@/store/viewStore";
import type { Timeframe } from "@/types/market";
import { RowResnap } from "@/stack/StackLayout";
import { StackBrackets } from "@/stack/StackBrackets";
import { StackEvidence } from "@/stack/StackEvidence";
import { usePublishBars } from "@/stack/stackBarsStore";
import type { RowClass } from "@/stack/viewportPolicy";
import { useDrillOnClick } from "@/stack/useDrillOnClick";
import { useRowRole, useContextCandles } from "@/stack/useRowRole";
import { useCursorBar, useSharedCrosshair } from "@/stack/useSharedCrosshair";
import { useStackViewport } from "@/stack/useStackViewport";
import { useTimelineViewport } from "@/stack/useTimelineViewport";
import "@/styles/panel.css";
import "@/styles/stack.css";
import { OhlcLegend } from "./OhlcLegend";
import { PanelHeader } from "./PanelHeader";
import { UnsupportedStrip } from "./UnsupportedStrip";

interface Props {
  tf: Timeframe;
  /** Tests inject a source; the app uses the one from `VITE_DATA_SOURCE`. */
  source?: DataSource;
  focused?: boolean;
  maximized?: boolean;
  onFocus?: () => void;
  onToggleMaximize?: () => void;
  /** Stack only: the row's density class. A collapsed row is a one-line strip and mounts no chart. */
  row?: { cls: RowClass; demoted: boolean };
}

export function ChartPanel(props: Props) {
  if (props.row?.cls === "collapsed") return <CollapsedRow tf={props.tf} source={props.source} demoted={props.row.demoted} />;
  return <ChartPanelBody {...props} />;
}

/** DX2: no chart instance, but the bars still load so lower rows can draw their parent brackets. */
function CollapsedRow({ tf, source, demoted }: { tf: Timeframe; source?: DataSource; demoted: boolean }) {
  const pair = useViewStore((s) => s.pair);
  const asOf = useViewStore((s) => s.asOf);
  const c = useCandles({ pair, tf, asOf, source });
  usePublishBars(tf, c.candles);
  const def = useScanStore(selectStrategyDef);
  const reason = useScanStore((s) => s.panels[tf].reason);
  const label = demoted ? "collapsed, not enough height" : `not supported by ${def?.name ?? "the selected strategy"}`;
  const why = demoted
    ? "The stack is too short to draw this row. Enlarge the window or hide rows from the Rows menu."
    : (reason ?? (def ? `Not supported by ${def.name}. Scan ${def.supported_timeframes.join(", ")} instead.` : "Not supported by the selected strategy."));
  return <UnsupportedStrip tf={tf} label={label} reason={why} />;
}

function ChartPanelBody({ tf, source, focused = false, maximized = false, onFocus, onToggleMaximize }: Props) {
  const pair = useViewStore((s) => s.pair);
  const asOf = useViewStore((s) => s.asOf);
  const timezone = useViewStore((s) => s.timezone);
  const tz = resolveTz(timezone);
  const c = useCandles({ pair, tf, asOf, source });
  const [hover, setHover] = useState<OhlcBar | null>(null);
  const [api, setApi] = useState<ChartApi | null>(null);
  const scan = useScanStore((s) => s.panels[tf]);
  const pins = useMemo(() => buildPins(tf, scan.result), [tf, scan.result]);
  const localOnly = usePanelStore((s) => s.localOnly.has(tf));
  const toggleLocalOnly = usePanelStore((s) => s.toggleLocalOnly);
  const ann = usePanelAnnotations(api, tf, pair, c.candles, pins, localOnly);
  const bodyRef = useRef<HTMLDivElement>(null);
  useStackViewport(api, tf, c.candles, bodyRef);
  useTimelineViewport(api, tf, c.candles, bodyRef, { hasMoreOlder: c.hasMoreOlder, loadOlder: c.loadOlder });
  useSharedCrosshair(api, tf, c.candles);
  const cursorBar = useCursorBar(tf, c.candles);
  const { stack, role, caption } = useRowRole(tf);
  useContextCandles(api, role);
  useDrillOnClick(tf, bodyRef, ann.hover !== null);
  usePublishBars(tf, c.candles);
  useActiveFocus(api, c.status, c.candles.length);
  const range = useScanStore((s) => s.range);
  const def = useScanStore(selectStrategyDef);
  const chip = panelChip(scan);
  const note = panelNote(tf, scan, range);
  const scanBlock = !def
    ? "Pick a strategy first"
    : scan.status === "unsupported"
      ? scan.reason
      : undefined;
  const shown: OhlcBar | undefined = hover ?? cursorBar ?? c.candles[c.candles.length - 1];
  const dim = stack && role !== null && ann.count === 0;

  return (
    <section
      className="panel" aria-label={`${tf} chart`} data-focused={focused} data-stack={stack} data-role={role ?? undefined}
      data-dim={dim} onMouseDown={onFocus}
    >
      <PanelHeader
        tf={tf}
        caption={caption}
        legend={ann.hover ? <AnnotationTooltip annotation={ann.hover} tz={tz} /> : <OhlcLegend bar={shown} pair={pair} tz={tz} />}
        maximized={maximized}
        onToggleMaximize={onToggleMaximize}
        state={chip.state}
        chipText={chip.text}
        onScan={() => void scanPanel(tf, source)}
        scanDisabledReason={scanBlock}
        localOnly={localOnly}
        onToggleLocalOnly={() => toggleLocalOnly(tf)}
      />
      <div ref={bodyRef} className="panel-body" onMouseMove={ann.onMouseMove} onMouseLeave={ann.onMouseLeave} onClick={ann.onClick}>
        <ChartCanvas
          pair={pair} tf={tf} tz={tz} candles={c.candles}
          hasMoreOlder={c.hasMoreOlder} loadOlder={c.loadOlder} onCrosshair={setHover} onApi={setApi}
        />
        {import.meta.env.DEV && <DevAnnotationDemo api={api} tf={tf} pair={pair} candles={c.candles} />}
        <StackBrackets api={api} tf={tf} candles={c.candles} />
        <StackEvidence api={api} tf={tf} candles={c.candles} bodyRef={bodyRef} />
        <RowResnap tf={tf} />
        {note && (
          <p className="panel-note" role={scan.status === "error" ? "alert" : "status"} data-kind={scan.status}>
            {note}
          </p>
        )}
        {c.status === "loading" && <div className="panel-overlay">Loading {tf}…</div>}
        {c.status === "error" && (
          <div className="panel-overlay" role="alert">
            <span>Couldn't load {tf} data{c.error ? `: ${c.error.message}` : ""}.</span>
            <button type="button" onClick={c.reload}>Retry</button>
          </div>
        )}
        {c.status === "ready" && c.candles.length === 0 && <div className="panel-overlay">No candles for this range.</div>}
      </div>
    </section>
  );
}