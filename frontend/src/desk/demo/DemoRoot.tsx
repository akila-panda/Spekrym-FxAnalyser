/** DEMO (removable) — the demo surface at ?window=demo: a real chart with simulated candles + sample
 *  overlays, the composed overlay list, and links to every feature surface so the whole product can be
 *  experienced on mock data. Delete src/desk/demo/ + its role to remove (see ./README.md). */
import { useMemo, useState } from "react";
import { composeCanvas } from "@/desk/canvas/pipeline";
import { DEMO_PAIR, DEMO_TF, demoCandles } from "./demoCandles";
import { demoObjects } from "./demoObjects";
import { DemoChart } from "./DemoChart";
import { isDemo } from "./flag";
import { InvestorDemo } from "./investor/InvestorDemo";
import "@/styles/demo.css";

const SURFACES: { id: string; label: string }[] = [
  { id: "canvas", label: "Intelligence Canvas (Prepare · Monitor · Review · Explore)" },
  { id: "journal", label: "Trade journal / Intelligence" },
  { id: "analytics", label: "Validation ledger board" },
  { id: "workbench", label: "Research Workbench" },
  { id: "brain", label: "Master Brain Console" },
  { id: "portfolio", label: "Portfolio Command" },
  { id: "ops", label: "Ops & Data Observatory" },
];

export function DemoRoot() {
  const [tour, setTour] = useState(isDemo);
  const pair = DEMO_PAIR;
  const tf = DEMO_TF;
  const candles = useMemo(() => demoCandles(pair, tf), [pair, tf]);
  const objects = useMemo(() => demoObjects(pair, tf), [pair, tf]);
  const composed = useMemo(() => composeCanvas({ objects }), [objects]);

  if (tour) return <InvestorDemo onGallery={() => setTour(false)} />;

  return (
    <div className="demo-root">
      <header className="demo-header region header-bar" aria-label="Demo">
        <strong>Spekrym-FX — Demo</strong>
        <span className="demo-sub">{pair} · {tf}</span>
        <span className="dk-sample">sample</span>
        {isDemo() && <button onClick={() => setTour(true)}>Open investor walkthrough</button>}
        <span className="spacer" />
        <span className="demo-note">simulated data — delete <code>src/desk/demo/</code> to remove</span>
      </header>

      <div className="demo-body">
        <main className="demo-chart" aria-label="Demo chart">
          <DemoChart pair={pair} tf={tf} candles={candles} objects={objects} />
        </main>

        <aside className="demo-rail">
          <section className="demo-panel" aria-label="On the chart">
            <h4>On the chart ({composed.overlays.length})</h4>
            <ul className="demo-list">
              {composed.overlays.map((o) => (
                <li key={o.key} className="demo-overlay"><span>{o.kind}</span><span className="demo-muted">{o.sources.length} src{o.stackCount > 0 ? ` · +${o.stackCount}` : ""}</span></li>
              ))}
            </ul>
          </section>

          <nav className="demo-panel" aria-label="Surfaces">
            <h4>Explore the surfaces</h4>
            <a className="demo-link" href="?app=desk&desk=my&wf=prepare&demo=1">DESK Prepare · chart-backed worksheet</a>
            <ul className="demo-list">
              {SURFACES.map((s) => (
                <li key={s.id}><a className="demo-link" href={`?window=${s.id}&demo=1`}>{s.label}</a></li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}
