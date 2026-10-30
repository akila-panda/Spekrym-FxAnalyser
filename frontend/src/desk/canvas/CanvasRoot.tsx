/** F1 — Intelligence Canvas shell (VI-1). A chart-centric primary surface (mounted at ?window=canvas):
 *  chart region (~70%), an intelligence source browser + selected-insight panel on the right, a timeline
 *  strip along the bottom, and four modes (Prepare · Explore · Monitor · Review). No engine draws here yet;
 *  this is the empty shell + the shared selection that keeps the panels in sync. Tokens only; "sample". */
import { useEffect, useMemo, useState } from "react";
import { useViewStore } from "@/store/viewStore";
import { SAMPLE_ENGINE_OBJECTS, SAMPLE_INSIGHTS, SAMPLE_NOW } from "@/intel/fixtures";
import { CANVAS_MODES, isCanvasMode, useCanvasStore, type CanvasMode } from "./canvasStore";
import { composeCanvas } from "./pipeline";
import { PREPARE_STEPS, applyPreset, overlayRef } from "./prepare/steps";
import { usePrepareStore } from "./prepare/prepareStore";
import { beforeNow, buildChangeFeed, sampleLiveFacts } from "./live/diff";
import { buildReview, sampleReviewInput } from "./review/scorecard";
import { analysisHref, applyEngineToggles, listEngines } from "./explore/engines";
import { useExploreStore } from "./explore/exploreStore";
import { FamilyPanels, RegimeStrip } from "./context/RegimeStrip";
import { SAMPLE_REGIME_SERIES } from "./context/regimeFixtures";
import { ScenarioStudio } from "./scenario/ScenarioStudio";
import { STUDIO_FORECASTS, STUDIO_SCENARIOS, STUDIO_STATES } from "./scenario/scenarioFixtures";
import { EngineLayer } from "./integration/EngineLayerPanel";
import { buildEngineLayer } from "./integration/engineLayer";
import { INTEGRATION_ELIGIBILITY, INTEGRATION_INSIGHTS, INTEGRATION_TRADES } from "./integration/integrationFixtures";
import { QueryBar } from "./query/QueryBar";
import { AttentionPanel } from "./attention/AttentionPanel";
import { TimelineBar } from "./timeline/TimelineBar";
import { SAMPLE_TIMELINE } from "./timeline/timelineFixtures";
import { useTimelineStore } from "./timeline/timelineStore";
import { isDemo } from "@/desk/demo/flag"; // DEMO (removable)
import { CanvasDemoChart } from "@/desk/demo/CanvasDemoChart";
import { intelligenceFixtures } from "@/desk/demo/intelligenceFixtures"; // DEMO (removable)
import "@/styles/canvas.css";
import "@/styles/query.css";

const MODE_LABEL: Record<CanvasMode, string> = {
  prepare: "Prepare", explore: "Explore", monitor: "Monitor", review: "Review",
};

/** Sample intelligence sources (a real IntelligenceSource replaces this in a later phase). */
const SOURCES: { id: string; label: string; state: string }[] = [
  { id: "structure", label: "Structure", state: "Mapped" },
  { id: "session", label: "Session liquidity", state: "Mapped" },
  { id: "regime", label: "Regime", state: "Available" },
  { id: "macro", label: "Macro events", state: "Available" },
  { id: "scenarios", label: "Scenarios", state: "2 active" },
];

const OVERLAY_PRESETS = ["Market map", "Liquidity", "Price action", "Show all"];

/** Read/write ?canvasMode= without disturbing other query params (e.g. window). */
function syncModeToUrl(mode: CanvasMode): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("canvasMode", mode);
    window.history.replaceState(null, "", url.toString());
  } catch { /* non-browser env */ }
}

export function CanvasRoot() {
  const pair = useViewStore((v) => v.pair);
  const demo = isDemo();
  const demoScene = useMemo(() => intelligenceFixtures(pair), [pair]);
  const objects = demo ? demoScene.objects : SAMPLE_ENGINE_OBJECTS;
  const insights = demo ? demoScene.insights : SAMPLE_INSIGHTS;
  const regimes = demo ? demoScene.regimes : SAMPLE_REGIME_SERIES;
  const scenarios = demo ? demoScene.scenarios : STUDIO_SCENARIOS;
  const states = demo ? demoScene.states : STUDIO_STATES;
  const forecasts = demo ? demoScene.forecasts : STUDIO_FORECASTS;
  const mode = useCanvasStore((s) => s.mode);
  const setMode = useCanvasStore((s) => s.setMode);
  const selectedSourceId = useCanvasStore((s) => s.selectedSourceId);
  const selectSource = useCanvasStore((s) => s.selectSource);

  // Restore mode from the URL on mount.
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("canvasMode");
      if (isCanvasMode(raw)) setMode(raw);
    } catch { /* ignore */ }
  }, [setMode]);

  const onMode = (m: CanvasMode) => { setMode(m); syncModeToUrl(m); };
  const selected = SOURCES.find((s) => s.id === selectedSourceId) ?? null;

  // GF1: composed, de-cluttered, causal overlay set from mock data (VI-2 → VI-3 → VI-4).
  // F12: the replay cursor rehydrates the same pipeline at its as-of (null = live/latest).
  const replayAsOf = useTimelineStore((s) => s.asOf);
  const viewAsOf = Math.min(replayAsOf ?? SAMPLE_NOW, SAMPLE_NOW);
  const composed = useMemo(
    () => composeCanvas({ objects, insights, asOf: viewAsOf }),
    [objects, insights, viewAsOf],
  );

  // F13: every engine's output in one causal, typed list (rehydrates with the replay cursor).
  const engineItems = useMemo(() => buildEngineLayer({
    objects, insights: demo ? demoScene.insights : INTEGRATION_INSIGHTS, regimes,
    scenarios, scenarioStates: states, forecasts,
    trades: demo ? demoScene.trades : INTEGRATION_TRADES, eligibility: demo ? demoScene.eligibility : INTEGRATION_ELIGIBILITY, instrument: pair, asOf: viewAsOf,
  }), [pair, viewAsOf, objects, demo, demoScene, regimes, scenarios, states, forecasts]);

  // F5: chart-native Prepare. The active step's preset filters which overlays the chart shows.
  const stepIndex = usePrepareStore((s) => s.stepIndex);
  const setStep = usePrepareStore((s) => s.setStep);
  const markReviewed = usePrepareStore((s) => s.markReviewed);
  const selectedIds = usePrepareStore((s) => s.selectedIds);
  const toggleSelect = usePrepareStore((s) => s.toggleSelect);
  const plan = usePrepareStore((s) => s.plan);
  const freeze = usePrepareStore((s) => s.freeze);
  const step = PREPARE_STEPS[stepIndex] ?? PREPARE_STEPS[0]!;
  const preparing = mode === "prepare";
  // F8: Explore — engine toggles filter DISPLAY only (composed set / detection untouched; P0 never hidden).
  const exploring = mode === "explore";
  const hiddenEngines = useExploreStore((s) => s.hiddenEngines);
  const toggleEngine = useExploreStore((s) => s.toggleEngine);
  const showAllEngines = useExploreStore((s) => s.showAll);
  // F19: Visual Query focus (display only — never hides an overlay).
  const [itemFocus, setItemFocus] = useState<string[]>([]);
  const [locatedItem, setLocatedItem] = useState<string | null>(null);
  const [queryFocus, setQueryFocus] = useState<string[]>([]);
  const engines = useMemo(() => listEngines(composed.overlays), [composed]);
  const [demoPreset, setDemoPreset] = useState<string | null>(null);
  const modeDisplayed = preparing
    ? applyPreset(composed.overlays, step.preset, selectedIds)
    : exploring ? applyEngineToggles(composed.overlays, hiddenEngines) : composed.overlays;
  const displayed = demo && demoPreset && demoPreset !== "Show all"
    ? modeDisplayed.filter(o => o.priority === 0 || (demoPreset === "Market map" ? ["zone", "line", "level"].includes(o.kind) : demoPreset === "Liquidity" ? o.sources.includes("session") : ["line", "marker"].includes(o.kind))) : modeDisplayed;
  const gotoStep = (i: number) => { setStep(i); markReviewed(PREPARE_STEPS[i]!.id); };

  // F6: Live/Monitor — classify live facts against the frozen plan (plan is never rewritten).
  const monitor = mode === "monitor";
  const liveFacts = useMemo(() => (plan ? sampleLiveFacts(plan) : []), [plan]);
  const feed = useMemo(() => (plan ? buildChangeFeed(plan, liveFacts) : []), [plan, liveFacts]);
  const bn = useMemo(() => (plan ? beforeNow(plan, liveFacts) : null), [plan, liveFacts]);

  // F7: Review — four independent axes over the completed session.
  const reviewing = mode === "review";
  const review = useMemo(() => (plan ? buildReview(sampleReviewInput(plan, feed)) : null), [plan, feed]);

  return (
    <div className="vc-root" data-mode={mode} data-demo={demo}>
      <header className="vc-header region header-bar" aria-label="Intelligence Canvas controls">
        <strong className="vc-title">Intelligence Canvas</strong>
        <span className="vc-pair">{pair}</span>
        <span className="dk-sample">sample</span>
        <div className="vc-seg" role="group" aria-label="Canvas mode">
          {CANVAS_MODES.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}>{MODE_LABEL[m]}</button>
          ))}
        </div>
        <span className="spacer" />
        <div className="vc-presets" role="group" aria-label="Overlay presets">
          {OVERLAY_PRESETS.map((p) => <button key={p} type="button" className="vc-preset" disabled={!demo} aria-pressed={demoPreset === p} onClick={() => setDemoPreset(p)} title={demo ? "Filter chart objects" : "Presets arrive in a later phase"}>{p}</button>)}
        </div>
      </header>

      {/* F9: regime strip — always visible; causal at the viewed time. */}
      <RegimeStrip series={regimes} asOf={viewAsOf} instrument={pair} />

      {preparing && (
        <div className="vc-prepare" aria-label="Prepare steps">
          <div className="vc-steprail" role="group" aria-label="Step">
            {PREPARE_STEPS.map((s, i) => (
              <button key={s.id} type="button" aria-current={i === stepIndex} onClick={() => gotoStep(i)}>{i + 1}. {s.title}</button>
            ))}
          </div>
          <span className="vc-question">{step.question}</span>
          <span className="spacer" />
          <button type="button" className="vc-freeze" onClick={() => freeze({ pair, asOf: viewAsOf })}>Freeze plan</button>
          {plan && <span className="vc-plan-badge">Plan frozen · {plan.selectedIds.length} objects</span>}
        </div>
      )}

      <QueryBar overlays={composed.overlays} items={engineItems} objects={objects} asOf={viewAsOf} onFocus={setQueryFocus} onItemFocus={demo ? setItemFocus : undefined} />

      <div className="vc-body">
        <main className="vc-stage" aria-label="Chart">
          {demo && <CanvasDemoChart scene={demoScene} pair={pair} asOf={viewAsOf} displayed={displayed}
            queryFocus={queryFocus} selectedIds={selectedIds} source={selectedSourceId} hiddenEngines={exploring ? hiddenEngines : []} itemFocus={itemFocus} locatedItem={locatedItem}
            onShowAll={() => { onMode("explore"); showAllEngines(); setDemoPreset("Show all"); }} />}
          {monitor ? (
            plan && bn ? (
              <div className="vc-monitor">
                <div className="vc-beforenow">
                  <span>Before: {bn.before.selectedIds.length} planned</span>
                  <span>Now: {bn.now.counts.expected} expected · {bn.now.counts.unexpected} unexpected · {bn.now.counts.confirmed} confirmed · {bn.now.counts.deteriorated} deteriorated</span>
                  <span className={bn.thesisIntact ? "vc-thesis-ok" : "vc-thesis-broken"}>Thesis {bn.thesisIntact ? "intact" : "invalidated"}</span>
                </div>
                <ul className="vc-feed" aria-live="polite" aria-label="Market change feed">
                  {feed.map((e) => (
                    <li key={e.id} className="vc-feed-row" data-cat={e.category}>
                      <span className="vc-feed-cat">{e.category.replace("_", " ")}</span>
                      <span className="vc-source-state">{e.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="vc-stage-note"><span className="dk-sample">sample</span> Freeze a plan in Prepare first to monitor it live.</p>
            )
          ) : reviewing ? (
            plan && review ? (
              <div className="vc-review">
                <p className="dk-muted"><span className="dk-sample">sample</span> Replay of what was knowable — four independent axes.</p>
                <div className="vc-axes">
                  {[review.analysis, review.decision, review.process, review.outcome].map((ax) => (
                    <section key={ax.key} className="vc-axis" aria-label={ax.title}>
                      <h4>{ax.title}</h4>
                      <strong className="vc-axis-verdict">{ax.verdict}</strong>
                      <p className="vc-source-state">{ax.rationale}</p>
                    </section>
                  ))}
                </div>
              </div>
            ) : (
              <p className="vc-stage-note"><span className="dk-sample">sample</span> Complete a session (Prepare → Monitor) to review it.</p>
            )
          ) : (
            <>
            {exploring && (
              <section className="vc-explore" aria-label="Explore engines">
                <h4>Engines <span className="dk-sample">sample</span></h4>
                <ul className="vc-sources">
                  {engines.map((e) => {
                    const on = !hiddenEngines.includes(e.id);
                    return (
                      <li key={e.id}>
                        <button type="button" className="vc-engine" aria-pressed={on} aria-label={`Engine ${e.id}`} onClick={() => toggleEngine(e.id)}>
                          <span aria-hidden="true">{on ? "●" : "○"}</span> <span>{e.id}</span>
                          <span className="vc-source-state">{on ? "shown" : "hidden"} · {e.count}{e.hasP0 ? " · P0 stays" : ""}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="vc-explore-actions">
                  <button type="button" onClick={showAllEngines} disabled={hiddenEngines.length === 0}>Show all engines</button>
                  <a className="vc-link" href={analysisHref(pair, window.location.pathname)} target="_blank" rel="noopener noreferrer">Open in Analysis</a>
                </div>
                <p className="dk-muted">Display only — toggles never change detection. Your plan and mode stay here.</p>
              </section>
            )}
            {!demo && <p className="vc-stage-note">
              <span className="dk-sample">sample</span>{" "}
              {selected ? `Focused: ${selected.label} — geometry arrives in a later phase.` : `${pair} — select a source to focus the chart. Chart arrives in a later phase.`}
            </p>}
            {(selectedSourceId === "scenarios" || demo) && (
              <ScenarioStudio specs={scenarios} states={states} forecasts={forecasts} objects={objects} asOf={viewAsOf} />
            )}
            </>
          )}
        </main>

        <aside className="vc-rail" aria-label="Intelligence">
          <section className="vc-panel" aria-label="Intelligence sources">
            <h4>Intelligence sources</h4>
            <ul className="vc-sources">
              {SOURCES.map((s) => (
                <li key={s.id}>
                  <button type="button" className="vc-source" aria-current={selectedSourceId === s.id} onClick={() => selectSource(selectedSourceId === s.id ? null : s.id)}>
                    <span>{s.label}</span><span className="vc-source-state">{demo && s.id === "scenarios" ? `${new Set(scenarios.filter(x => x.asOf <= viewAsOf).map(x => x.id)).size} available` : s.state}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="vc-panel" aria-label="Overlays">
            <h4>Overlays ({displayed.length}{preparing || exploring ? ` of ${composed.overlays.length}` : ""})</h4>
            <ul className="vc-sources">
              {displayed.map((o) => {
                const ref = overlayRef(o);
                return (
                  <li key={o.key}>
                    <button type="button" className="vc-overlay" aria-pressed={selectedIds.includes(ref)} data-query-focus={queryFocus.includes(o.key)} onClick={() => toggleSelect(ref)}>
                      <span>{queryFocus.includes(o.key) ? "◎ focused · " : ""}{o.kind}</span>
                      <span className="vc-source-state">{o.sources.length} src{o.stackCount > 0 ? ` · +${o.stackCount}` : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="dk-muted">{composed.collapsedCount} collapsed · {composed.conflictCount} conflicts · <span className="dk-sample">sample</span></p>
          </section>
          <FamilyPanels series={regimes} asOf={viewAsOf} instrument={pair} />
          <AttentionPanel items={engineItems} overlays={composed.overlays} plan={plan} asOf={viewAsOf} feed={feed}
            feedAsOf={replayAsOf ?? Infinity} reachedIds={bn?.now.reachedIds ?? []} />
          <EngineLayer items={engineItems} onFocus={demo ? setLocatedItem : undefined} />
          <section className="vc-panel" aria-label="Selected insight">
            <h4>Selected insight</h4>
            {demo && locatedItem && <p className="dk-muted">{engineItems.find(i => i.id === locatedItem)?.label ?? "Item no longer knowable"} · {engineItems.find(i => i.id === locatedItem)?.surface === "context" ? "Context only; no price geometry supplied." : "Highlighted on chart when its layer is visible."}</p>}
            {selected
              ? <p className="vc-selected">{selected.label} — inspect the highlighted geometry, event time, and evidence before interpreting.</p>
              : <p className="dk-muted">Nothing selected.</p>}
          </section>
        </aside>
      </div>

      <TimelineBar entries={demo ? demoScene.timeline : SAMPLE_TIMELINE} />
    </div>
  );
}