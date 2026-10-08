import { useMemo, useState } from "react";
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
import "@/styles/panel.css";
import { OhlcLegend } from "./OhlcLegend";
import { PanelHeader } from "./PanelHeader";

interface Props {
  tf: Timeframe;
  /** Tests inject a source; the app uses the one from `VITE_DATA_SOURCE`. */
  source?: DataSource;
  focused?: boolean;
  maximized?: boolean;
  onFocus?: () => void;
  onToggleMaximize?: () => void;
}

export function ChartPanel({ tf, source, focused = false, maximized = false, onFocus, onToggleMaximize }: Props) {
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
  const shown: OhlcBar | undefined = hover ?? c.candles[c.candles.length - 1];

  return (
    <section className="panel" aria-label={`${tf} chart`} data-focused={focused} onMouseDown={onFocus}>
      <PanelHeader
        tf={tf}
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
      <div className="panel-body" onMouseMove={ann.onMouseMove} onMouseLeave={ann.onMouseLeave} onClick={ann.onClick}>
        <ChartCanvas
          pair={pair} tf={tf} tz={tz} candles={c.candles}
          hasMoreOlder={c.hasMoreOlder} loadOlder={c.loadOlder} onCrosshair={setHover} onApi={setApi}
        />
        {import.meta.env.DEV && <DevAnnotationDemo api={api} tf={tf} pair={pair} candles={c.candles} />}
        {scan.status === "unsupported" && <div className="panel-hatch" aria-hidden="true" />}
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