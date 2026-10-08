import { useCallback, useEffect } from "react";
import type { DataSource } from "@/api/dataSource";
import { getDataSource } from "@/api/sourceFactory";
import { useScanStore } from "./scanStore";

const isAbort = (e: unknown) => e instanceof Error && (e.name === "AbortError" || (e as { kind?: string }).kind === "aborted");

/** Loads the strategy catalog once and selects the first strategy. */
export function useStrategies(source?: DataSource) {
  const strategies = useScanStore((s) => s.strategies);
  const status = useScanStore((s) => s.catalog);
  const error = useScanStore((s) => s.catalogError);
  const src = source ?? getDataSource();

  const load = useCallback(
    (signal?: AbortSignal) => {
      const st = useScanStore.getState();
      st.setCatalogStatus("loading");
      src
        .getStrategies(signal)
        .then((list) => useScanStore.getState().setCatalog(list))
        .catch((e: unknown) => {
          if (isAbort(e)) return;
          useScanStore
            .getState()
            .setCatalogStatus("error", "Couldn't load strategies. Check that the backend is running, then retry.");
        });
    },
    [src],
  );

  useEffect(() => {
    const ctl = new AbortController();
    if (useScanStore.getState().catalog !== "ready") load(ctl.signal);
    return () => ctl.abort();
  }, [load]);

  return { strategies, status, error, retry: () => load() };
}