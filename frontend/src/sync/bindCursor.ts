/** W5: mirrors the shared crosshair time across windows via the ephemeral `cursor` topic (no revisions, no snapshot). */
import type { Transport } from "./channel";
import { debounce } from "./debounce";
import { isRecord, type Binding } from "./bindStore";
import { makeEnvelope, type RemoteGuard } from "./protocol";

export interface CursorPayload {
  t: number | null;
}

export function validateCursor(raw: unknown): CursorPayload | null {
  if (!isRecord(raw)) return null;
  const { t } = raw;
  if (t === null) return { t: null };
  return typeof t === "number" && Number.isFinite(t) ? { t } : null;
}

export interface CursorStoreLike {
  getState(): {
    time: number | null;
    source: unknown;
    setRemote(time: number | null): void;
    setPeers(n: number): void;
  };
  subscribe(listener: (s: { time: number | null; source: unknown }, prev: { time: number | null; source: unknown }) => void): () => void;
}

export interface PresenceLike {
  count(): number;
  onChange(fn: (peers: unknown[]) => void): () => void;
}

export const CURSOR_DEBOUNCE_MS = 40;

export function bindCursor(
  ctx: { self: string; transport: Transport; guard: RemoteGuard },
  store: CursorStoreLike,
  presence: PresenceLike,
  debounceMs: number = CURSOR_DEBOUNCE_MS,
): Binding {
  const send = (t: number | null) => ctx.transport.post(makeEnvelope("cursor", "cursor", 0, ctx.self, { t }));
  const sendLater = debounce((t: number) => {
    if (presence.count() > 0) send(t);
  }, debounceMs);

  store.getState().setPeers(presence.count());
  const offPresence = presence.onChange((peers) => store.getState().setPeers(peers.length));

  const offStore = store.subscribe((s, prev) => {
    if (ctx.guard.active) return; // remote apply: never re-broadcast
    if (presence.count() === 0) return;
    if (s.time !== null && s.source !== null) {
      sendLater(s.time);
      return;
    }
    if (s.time === null && prev.source !== null) {
      sendLater.cancel();
      send(null);
    }
  });

  const offTransport = ctx.transport.subscribe((env) => {
    if (env.type !== "cursor") return;
    const p = validateCursor(env.payload);
    if (!p) return;
    ctx.guard.run(() => store.getState().setRemote(p.t));
  });

  return {
    dispose() {
      sendLater.cancel();
      offStore();
      offTransport();
      offPresence();
    },
  };
}