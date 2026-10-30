/** DESK DK3 — Layers panel: six layers, "n of 6 visible", presets (presentation only), per-layer settings
 *  as an inline popover from the layer row. All controls are real, labelled, keyboard-reachable. */
import { useState } from "react";
import { LAYERS, type LayerId } from "@/desk/types/schemas";
import { TIMEFRAMES, type Timeframe } from "@/types/market";
import { LAYER_LABELS, PRESETS, type PresetId } from "./layerPresets";
import { selectVisibleCount, useLayerStore } from "./layerStore";

const LOOKBACKS = [null, 100, 300, 1000] as const;

function LayerSettingsPopover({ id }: { id: LayerId }) {
  const s = useLayerStore((st) => st.settings[id]);
  const setLayer = useLayerStore((st) => st.setLayer);
  const label = LAYER_LABELS[id];
  const toggleTf = (tf: Timeframe) => {
    const cur = s.sourceTfs ?? [...TIMEFRAMES];
    const next = cur.includes(tf) ? cur.filter((t) => t !== tf) : [...cur, tf];
    setLayer(id, { sourceTfs: next.length === TIMEFRAMES.length ? null : next });
  };
  return (
    <div className="dk-popover" role="group" aria-label={`${label} settings`}>
      <div className="dk-row" role="group" aria-label="Source timeframes">
        {TIMEFRAMES.map((tf) => (
          <button key={tf} type="button" className="dk-chip" aria-pressed={s.sourceTfs === null || s.sourceTfs.includes(tf)} onClick={() => toggleTf(tf)}>{tf}</button>
        ))}
      </div>
      <label className="dk-field">Lookback
        <select value={String(s.lookbackBars)} onChange={(e) => setLayer(id, { lookbackBars: e.target.value === "null" ? null : Number(e.target.value) })}>
          {LOOKBACKS.map((n) => <option key={String(n)} value={String(n)}>{n === null ? "All" : `${n} bars`}</option>)}
        </select>
      </label>
      <label className="dk-field">Min significance {s.minSignificance.toFixed(1)}
        <input type="range" min={0} max={1} step={0.1} value={s.minSignificance} onChange={(e) => setLayer(id, { minSignificance: Number(e.target.value) })} />
      </label>
      <label className="dk-field">Max objects
        <input type="number" min={1} max={99} placeholder="auto" value={s.maxObjects ?? ""} onChange={(e) => setLayer(id, { maxObjects: e.target.value === "" ? null : Math.max(1, Number(e.target.value)) })} />
      </label>
      <label className="dk-check"><input type="checkbox" checked={s.showTested} onChange={(e) => setLayer(id, { showTested: e.target.checked })} /> Show tested</label>
      <label className="dk-check"><input type="checkbox" checked={s.showInvalid} onChange={(e) => setLayer(id, { showInvalid: e.target.checked })} /> Show mitigated / invalid</label>
      <label className="dk-check"><input type="checkbox" checked={s.projectFromHtf} onChange={(e) => setLayer(id, { projectFromHtf: e.target.checked })} /> Project from higher timeframes</label>
    </div>
  );
}

export function LayersPanel() {
  const settings = useLayerStore((s) => s.settings);
  const preset = useLayerStore((s) => s.preset);
  const toggle = useLayerStore((s) => s.toggle);
  const applyPreset = useLayerStore((s) => s.applyPreset);
  const reset = useLayerStore((s) => s.reset);
  const count = useLayerStore(selectVisibleCount);
  const [open, setOpen] = useState<LayerId | null>(null);
  return (
    <div className="dk-layers">
      <div className="dk-row">
        <span aria-live="polite">{count} of {LAYERS.length} visible</span>
        <select aria-label="Layer preset" value={preset ?? ""} onChange={(e) => e.target.value && applyPreset(e.target.value as PresetId)}>
          <option value="">Preset…</option>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <ul className="dk-layer-list">
        {LAYERS.map((id) => (
          <li key={id}>
            <div className="dk-row">
              <label className="dk-check"><input type="checkbox" checked={settings[id].visible} onChange={() => toggle(id)} /> {LAYER_LABELS[id]}</label>
              <button type="button" className="dk-icon" aria-expanded={open === id} aria-label={`${LAYER_LABELS[id]} settings`} title="Settings" onClick={() => setOpen(open === id ? null : id)}>⚙</button>
            </div>
            {open === id && <LayerSettingsPopover id={id} />}
          </li>
        ))}
      </ul>
      <button type="button" onClick={reset}>Reset to core</button>
    </div>
  );
}