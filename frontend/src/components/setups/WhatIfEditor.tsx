import { useOverrideStore, whatIfR } from "@/annotations/overrides";
import type { AnnotationOf } from "@/types/annotations";
import type { Setup } from "@/types";
import "@/styles/whatif.css";

type TradeAnn = AnnotationOf<"trade">;

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() !== "" && !Number.isNaN(n) ? n : undefined;
};

/** Edit a setup's entry/stop/target to see a what-if R. Never the strategy's own result. */
export function WhatIfEditor({ setup }: { setup: Setup }) {
  const trade = setup.annotations.find((a): a is TradeAnn => a.kind === "trade");
  const trades = useOverrideStore((s) => s.trades);
  const setTrade = useOverrideStore((s) => s.setTrade);
  const resetTrade = useOverrideStore((s) => s.resetTrade);
  if (!trade) return null;

  const o = trades[trade.id] ?? {};
  const edited = o.entry !== undefined || o.stop !== undefined || o.target !== undefined;
  const entry = o.entry ?? trade.entry;
  const stop = o.stop ?? trade.stop;
  const target = o.target ?? trade.target;
  const r = whatIfR(trade.direction, entry, stop, target);

  const field = (key: "entry" | "stop" | "target", value: number) => (
    <label className="whatif-field">
      <span>{key}</span>
      <input
        type="number"
        step="any"
        value={value}
        aria-label={`${key} price`}
        onChange={(e) => setTrade(trade.id, { [key]: num(e.target.value) })}
      />
    </label>
  );

  return (
    <div className="whatif" aria-label="What-if editor">
      <div className="rail-section-title">
        What-if {edited && <span className="whatif-badge">edited</span>}
      </div>
      <div className="whatif-fields">
        {field("entry", entry)}
        {field("stop", stop)}
        {field("target", target)}
      </div>
      <p className="hint mono">
        What-if R: {r === null ? "—" : `${r.toFixed(2)}R`}
        <span className="whatif-caveat"> · not the strategy's result</span>
      </p>
      {edited && (
        <button type="button" className="whatif-reset" onClick={() => resetTrade(trade.id)}>
          Reset to strategy
        </button>
      )}
    </div>
  );
}
