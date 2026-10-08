import type { DataSource } from "@/api/dataSource";
import { scanAll } from "@/scan/scanRunner";
import { selectSupportedCount, useScanStore } from "@/scan/scanStore";

export function ScanAllButton({ source }: { source?: DataSource }) {
  const n = useScanStore(selectSupportedCount);
  const running = useScanStore((s) => Object.values(s.panels).some((p) => p.status === "running"));
  return (
    <button
      type="button" className="primary" disabled={n === 0}
      title={n === 0 ? "Pick a strategy first" : `Scan the ${n} supported charts`}
      onClick={() => void scanAll(source)}
    >
      {running ? "Scanning…" : `Scan all (${n})`}
    </button>
  );
}