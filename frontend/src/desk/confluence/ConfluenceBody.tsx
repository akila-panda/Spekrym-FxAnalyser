/** DESK DK12 — Confluence widget: contradictions first, then multi-timeframe confluence areas.
 *  Descriptive only (never a prediction); counts are "heuristic". Every row is a real button that selects its first object. */
import { useAnalysisStore } from "@/desk/detect/analysisStore";
import { fmtPrice } from "@/desk/evidence/describe";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { PAIR_META, type Pair } from "@/types/market";

const pips = (pair: string, d: number): string => (d / PAIR_META[pair as Pair].pip).toFixed(1);

export function ConfluenceBody() {
  const { confluence, objects, dataKind } = useAnalysisStore();
  const selected = useDeskUiStore((s) => s.selectedObjectId);
  const select = useDeskUiStore((s) => s.select);
  const { areas, contradictions } = confluence;
  const pairOf = (id: string): string => objects.find((o) => o.id === id)?.pair ?? "EUR_USD";
  if (areas.length === 0 && contradictions.length === 0) {
    return <p className="dk-muted">No confluence in view — widen lookback, show more layers or add a higher timeframe.</p>;
  }
  return (
    <div className="dk-conf">
      <p className="dk-muted"><span className="dk-sample">{dataKind}</span> Heuristic · descriptive overlap, not a forecast.</p>
      <section aria-label="Contradictions">
        <h4>Contradictions ({contradictions.length})</h4>
        {contradictions.length === 0 ? <p className="dk-muted">None in view.</p> : (
          <ul>
            {contradictions.map((c) => (
              <li key={c.id}>
                <button type="button" className="dk-conf-row is-contra" aria-current={selected === c.aId} onClick={() => select(c.aId)}>
                  <span aria-hidden="true">≠</span><span>Contradiction: {c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Multi-timeframe confluence areas">
        <h4>Multi-timeframe confluence areas ({areas.length})</h4>
        {areas.length === 0 ? <p className="dk-muted">None in view.</p> : (
          <ul>
            {areas.map((a) => {
              const first = a.memberIds[0] as string;
              return (
                <li key={a.id}>
                  <button type="button" className="dk-conf-row" aria-current={a.memberIds.includes(selected ?? "")} onClick={() => select(first)}>
                    <span aria-hidden="true">◫</span>
                    <span>
                      {a.tfs.join(" + ")} · {fmtPrice(pairOf(first) as never, a.band.pLow)}–{fmtPrice(pairOf(first) as never, a.band.pHigh)}
                      {" "}({pips(pairOf(first), a.band.pHigh - a.band.pLow)} pips) · {a.independent} independent
                      {a.direction === "mixed" ? " · mixed direction" : a.direction === "none" ? "" : ` · ${a.direction}`}
                      {a.contradictionIds.length ? ` · ${a.contradictionIds.length} contradiction${a.contradictionIds.length === 1 ? "" : "s"}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}