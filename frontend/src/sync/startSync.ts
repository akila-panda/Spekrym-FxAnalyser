import { isScanLocal } from "@/scan/scanRunner";
import { useScanStore } from "@/scan/scanStore";
import { useCursorStore } from "@/stack/cursorStore";
import { parseRole, roleParam } from "@/window/role";
import { bindView } from "./bindView";
import { bindAnnotation, bindOverrides } from "./bindOther";
import { bindCursor } from "./bindCursor";
import { bindScanInputs, bindScanResults, validateScanResults } from "./bindScan";
import type { BindContext } from "./bindStore";
import { createTransport } from "./channel";
import { createLeader, defaultLocks } from "./leader";
import { createPresence, type Presence } from "./presence";
import { createRemoteGuard, makeHello, makeOrigin } from "./protocol";
import { createRevisions } from "./revision";
import { createRunnerTracker, orphanPatch } from "./scanOrphans";

const HELLO_RETRY_MS = 500;

export interface SyncHandle {
  readonly self: string;
  readonly presence: Presence;
  dispose(): void;
}

let current: SyncHandle | null = null;

/** The running sync handle, or null before `startSync()` (tests, spike). */
export const getSync = (): SyncHandle | null => current;

/** Starts cross-window sync once per window. Called from the entry point, never from components or tests. */
export function startSync(): SyncHandle {
  if (current) return current;
  const self = makeOrigin();
  const transport = createTransport(self);
  const leader = createLeader(defaultLocks());
  const ctx: BindContext = {
    self,
    transport,
    revisions: createRevisions(self),
    guard: createRemoteGuard(),
    isLeader: leader.isLeader,
  };
  // `panelStore` has no replicated fields (layout/focus are window-scoped), so it is not bound.
  const bindings = [bindView(ctx), bindScanInputs(ctx), bindScanResults(ctx), bindAnnotation(ctx), bindOverrides(ctx)];

  // A window that dies mid-scan leaves "scanning" mirrored everywhere: reset those panels when it disappears.
  const tracker = createRunnerTracker();
  const unsubTracker = transport.subscribe((env) => {
    if (env.slice !== "scanResults" || (env.type !== "delta" && env.type !== "state")) return;
    const v = validateScanResults(env.payload);
    if (v) tracker.observe(env.origin, v.panels);
  });

  const presence = createPresence({ self, role: roleParam(parseRole(window.location.search)) ?? "main", transport });
  const unsubLeave = presence.onLeave((origin) => {
    const tfs = tracker.orphansOf(origin);
    if (tfs.length === 0) return;
    const panels = orphanPatch(useScanStore.getState().panels, tfs, isScanLocal);
    if (panels) useScanStore.setState({ panels });
  });

  // W5: ephemeral crosshair topic (no revisions, no snapshot).
  bindings.push(bindCursor(ctx, useCursorStore, presence));
  presence.start();

  // Snapshot on open. A second hello covers the case where the leader changed while this window was opening.
  transport.post(makeHello(self));
  const retry = setTimeout(() => transport.post(makeHello(self)), HELLO_RETRY_MS);

  current = {
    self,
    presence,
    dispose() {
      clearTimeout(retry);
      unsubLeave();
      unsubTracker();
      presence.stop();
      bindings.forEach((b) => b.dispose());
      leader.dispose();
      transport.close();
      current = null;
    },
  };
  return current;
}