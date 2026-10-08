import { useState } from "react";
import { getDataSource } from "@/api/sourceFactory";
import { useAnnotationStore } from "@/store/annotationStore";
import { useViewStore } from "@/store/viewStore";
import { buildDevSetup, DEV_BARS_NEEDED } from "./devSetup";

/** DEV ONLY: loads a sample setup into the annotation store from the current pair and moment. */
export function DevSetupLoader() {
  const setSetup = useAnnotationStore((s) => s.setSetup);
  const has = useAnnotationStore((s) => s.annotations.length > 0);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (has) return setSetup(null);
    try {
      const { pair, asOf } = useViewStore.getState();
      const bars = await getDataSource().getCandles({ pair, tf: "M15", to: asOf ?? undefined, limit: DEV_BARS_NEEDED });
      setSetup(buildDevSetup(bars));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    }
  };

  return (
    <div>
      <button type="button" onClick={() => void load()}>
        {has ? "Clear mock setup" : "Load mock setup"}
      </button>
      {err && <p role="alert">Couldn't load the mock setup: {err}.</p>}
    </div>
  );
}