import type { Transport } from "./channel";
import { makeEnvelope, shouldBroadcast, type DataSlice, type RemoteGuard } from "./protocol";
import type { Revisions } from "./revision";

export interface StoreLike<S> {
  getState(): S;
  setState(partial: Partial<S>): void;
  subscribe(listener: (state: S, prev: S) => void): () => void;
}

export interface BindContext {
  self: string;
  transport: Transport;
  revisions: Revisions;
  guard: RemoteGuard;
  /** Only the leader answers `hello`. Omitted ⇒ every window with state answers (duplicates are dropped by revision). */
  isLeader?: () => boolean;
}

export interface BindOptions<S, P> extends BindContext {
  slice: DataSlice;
  store: StoreLike<S>;
  /** The replicated part of the state. */
  pick: (s: S) => P;
  /** Returns null for anything malformed; such messages are ignored. */
  validate: (raw: unknown) => P | null;
  /** Receives the current state so a remote apply can also update local bookkeeping. */
  toPatch: (p: P, s: S) => Partial<S>;
  equals?: (a: P, b: P) => boolean;
}

export interface Binding {
  dispose(): void;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra);
  if (ka.length !== Object.keys(rb).length) return false;
  return ka.every((k) => Object.is(ra[k], rb[k]));
}

/**
 * Replicates one store slice. Only LOCAL mutations are broadcast; remote payloads are applied under the guard
 * so they are never re-broadcast. The leader answers `hello` with its current state.
 */
export function bindStore<S, P>(o: BindOptions<S, P>): Binding {
  const equals = o.equals ?? shallowEqual;

  const unsubStore = o.store.subscribe((s, prev) => {
    if (!shouldBroadcast(o.guard.tag())) return;
    const next = o.pick(s);
    if (equals(next, o.pick(prev))) return;
    const stamp = o.revisions.next(o.slice);
    o.transport.post(makeEnvelope("delta", o.slice, stamp.revision, o.self, next));
  });

  const unsubTransport = o.transport.subscribe((env) => {
    if (env.type === "hello") {
      if (o.isLeader && !o.isLeader()) return;
      const stamp = o.revisions.stamp(o.slice);
      if (!stamp) return; // untouched: nothing worth sending
      // Carry the writer's stamp so receivers deduplicate replies.
      o.transport.post(makeEnvelope("state", o.slice, stamp.revision, stamp.origin, o.pick(o.store.getState())));
      return;
    }
    if (env.slice !== o.slice || (env.type !== "delta" && env.type !== "state")) return;
    const payload = o.validate(env.payload);
    if (payload === null) return;
    if (!o.revisions.accept(env)) return;
    if (equals(payload, o.pick(o.store.getState()))) return;
    o.guard.run(() => o.store.setState(o.toPatch(payload, o.store.getState())));
  });

  return {
    dispose() {
      unsubStore();
      unsubTransport();
    },
  };
}