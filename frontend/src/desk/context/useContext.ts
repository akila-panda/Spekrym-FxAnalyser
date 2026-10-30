/** DESK DK15 — context data hook: capabilities + calendar events from the DeskSource, on Desk's own clock.
 *  "now" = the Desk as-of when set, else the source's provenance time (sample = fixed instant). Never writes viewStore.asOf. */
import { useCallback, useEffect, useState } from "react";
import { getDeskSource } from "@/desk/source/deskSourceFactory";
import type { DeskCapabilities, DeskEvent } from "@/desk/source/deskSource";
import type { Sourced } from "@/desk/types/schemas";
import { useDeskUiStore } from "@/desk/workspace/deskUiStore";
import { CAL } from "./calendar";

export interface ContextData {
  now: number;
  caps: Sourced<DeskCapabilities>;
  events: Sourced<DeskEvent[]>;
}
export type ContextState = { status: "loading" } | { status: "error"; retry: () => void } | { status: "ready"; data: ContextData };

export function useDeskContext(): ContextState {
  const asOf = useDeskUiStore((s) => s.asOf);
  const [state, setState] = useState<ContextState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    const ac = new AbortController();
    const src = getDeskSource();
    setState({ status: "loading" });
    (async () => {
      try {
        const caps = await src.capabilities(ac.signal);
        const now = asOf === "latest" ? caps.provenance.asOf : asOf;
        const events = await src.getEvents({ from: now - CAL.pastSec, to: now + CAL.aheadSec }, ac.signal);
        if (!ac.signal.aborted) setState({ status: "ready", data: { now, caps, events } });
      } catch {
        if (!ac.signal.aborted) setState({ status: "error", retry });
      }
    })();
    return () => ac.abort();
  }, [asOf, tick, retry]);
  return state;
}