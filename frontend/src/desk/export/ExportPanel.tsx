/** DESK DK7 — "Export to TradingView" section of the Prepare worksheet. Pick a saved snapshot, see the limits meter,
 *  copy/download Pine v6, or copy the plain list. Real labelled buttons; status in a live region. */
import { useMemo, useState } from "react";
import { usePrepareStore } from "@/desk/prepare/prepareStore";
import { snapshotsForDay, useSnapshotStore } from "@/desk/prepare/snapshotStore";
import type { Snapshot } from "@/desk/types/schemas";
import { buildPine, exportBase } from "./pine";
import { METER_KEYS, meterLabel } from "./pineLimits";

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function ExportView({ snapshots }: { snapshots: readonly Snapshot[] }) {
  const [pick, setPick] = useState<string>("");
  const [status, setStatus] = useState("");
  const snap = snapshots.find((s) => s.id === pick) ?? snapshots[snapshots.length - 1];
  const out = useMemo(() => (snap ? buildPine(snap) : null), [snap]);
  if (!snap || !out) return <p className="dk-muted">Save a snapshot to enable the TradingView export.</p>;
  const { manifest: m, meter } = out;
  const copy = async (text: string, what: string) => {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setStatus(`${what} copied.`);
    } catch { setStatus("Copy not available here — use Download."); }
  };
  return (
    <section className="dk-card" aria-label="Export to TradingView">
      <p><strong>Export to TradingView</strong> <span className="dk-sample">{m.dataKind}</span></p>
      <label className="dk-field">Snapshot
        <select value={snap.id} onChange={(e) => { setPick(e.target.value); setStatus(""); }}>
          {snapshots.map((s) => <option key={s.id} value={s.id}>{s.date} · {s.acceptedIds.length} accepted · {s.rulesVersion}</option>)}
        </select>
      </label>
      <ul className="dk-snaps" aria-label="TradingView limits">
        {METER_KEYS.map((k) => <li key={k} className="dk-muted">{meterLabel(k, meter)}</li>)}
      </ul>
      <p className="dk-muted">Exported {m.exported} · skipped: spent {m.skipped.spent}, unsupported {m.skipped.unsupported}, over limits {m.skipped.overLimit}</p>
      {m.skipped.overLimit > 0 && <p role="alert" className="dk-pin">⚠ {m.skipped.overLimit} items left out — over TradingView limits. Use the plain list for the full set.</p>}
      {m.exported === 0 && <p className="dk-muted">Nothing drawable in this snapshot — accept levels first, or use the plain list.</p>}
      <div className="dk-actions">
        <button type="button" onClick={() => copy(out.code, "Pine script")}>Copy Pine</button>
        <button type="button" onClick={() => download(`${exportBase(snap)}.pine`, out.code)}>Download .pine</button>
        <button type="button" onClick={() => copy(out.plain, "Plain list")}>Copy plain list</button>
        <button type="button" onClick={() => download(`${exportBase(snap)}.txt`, out.plain)}>Download .txt</button>
        <span className="dk-muted" role="status">{status}</span>
      </div>
      <p className="dk-muted">{m.fxRoll}</p>
    </section>
  );
}

export function ExportPanel() {
  const view = usePrepareStore((s) => s.view);
  const all = useSnapshotStore((s) => s.snapshots);
  const mine = useMemo(() => (view ? snapshotsForDay(all, view.pair, view.date) : []), [all, view]);
  return <ExportView snapshots={mine} />;
}