import { usePanelStore } from "@/panels/panelStore";
import { useScanStore } from "@/scan/scanStore";
import { fileBase, toCsv, toJson } from "@/export/exportScan";
import type { ScanResult } from "@/types";

function download(name: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Exports the active (or focused) panel's scan result as CSV or JSON. Disabled until a scan has results. */
export function ExportButton() {
  const active = useScanStore((s) => s.active);
  const focused = usePanelStore((s) => s.focused);
  const result: ScanResult | undefined = useScanStore(
    (s) => (active ? s.panels[active.tf].result : s.panels[focused].result),
  );
  const disabled = !result || result.setups.length === 0;

  return (
    <span className="export-group" role="group" aria-label="Export scan">
      <button
        type="button"
        disabled={disabled}
        title={disabled ? "Scan first to export" : "Download setups as CSV"}
        onClick={() => result && download(`${fileBase(result)}.csv`, "text/csv;charset=utf-8", toCsv(result))}
      >
        CSV
      </button>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? "Scan first to export" : "Download full scan result as JSON"}
        onClick={() => result && download(`${fileBase(result)}.json`, "application/json", toJson(result))}
      >
        JSON
      </button>
    </span>
  );
}
