import { CHANNEL_NAME, encodeEnvelope, isEcho, parseEnvelope, type Envelope } from "./protocol";

export type Listener = (env: Envelope) => void;

export interface Transport {
  readonly kind: "broadcast" | "storage" | "memory" | "none";
  post(env: Envelope): void;
  subscribe(fn: Listener): () => void;
  close(): void;
}

export interface BroadcastLike {
  postMessage(data: unknown): void;
  close(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}
export type BroadcastCtor = new (name: string) => BroadcastLike;

export interface StorageEventLike {
  key: string | null;
  newValue: string | null;
}
export interface StorageTarget {
  addEventListener(type: "storage", fn: (e: StorageEventLike) => void): void;
  removeEventListener(type: "storage", fn: (e: StorageEventLike) => void): void;
}

export interface TransportEnv {
  BroadcastChannelCtor?: BroadcastCtor;
  storage?: Pick<Storage, "setItem">;
  target?: StorageTarget;
}

export const STORAGE_KEY = "spekrym.sync.msg";

function createDispatcher(self: string) {
  const listeners = new Set<Listener>();
  return {
    /** Validates, drops garbage and own echoes, then fans out. */
    dispatch(raw: unknown): void {
      const env = parseEnvelope(raw);
      if (!env || isEcho(env, self)) return;
      for (const l of [...listeners]) l(env);
    },
    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    clear(): void {
      listeners.clear();
    },
  };
}

function broadcastTransport(self: string, Ctor: BroadcastCtor): Transport {
  const bc = new Ctor(CHANNEL_NAME);
  const d = createDispatcher(self);
  bc.onmessage = (e) => d.dispatch(e.data);
  return {
    kind: "broadcast",
    post(env) {
      try {
        bc.postMessage(encodeEnvelope(env));
      } catch {
        /* channel closed: drop */
      }
    },
    subscribe: d.subscribe,
    close() {
      bc.onmessage = null;
      bc.close();
      d.clear();
    },
  };
}

/** Fallback: a unique value per post so `storage` fires in the other windows even for identical messages. */
function storageTransport(self: string, storage: Pick<Storage, "setItem">, target: StorageTarget): Transport {
  const d = createDispatcher(self);
  let seq = 0;
  let closed = false;
  const onStorage = (e: StorageEventLike) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    const i = e.newValue.indexOf("|");
    if (i < 0) return;
    d.dispatch(e.newValue.slice(i + 1));
  };
  target.addEventListener("storage", onStorage);
  return {
    kind: "storage",
    post(env) {
      if (closed) return;
      seq += 1;
      try {
        storage.setItem(STORAGE_KEY, `${self}:${seq}:${Date.now()}|${encodeEnvelope(env)}`);
      } catch {
        /* storage unavailable or full: drop */
      }
    },
    subscribe: d.subscribe,
    close() {
      closed = true;
      target.removeEventListener("storage", onStorage);
      d.clear();
    },
  };
}

function defaultEnv(): TransportEnv {
  const env: TransportEnv = {};
  if (typeof BroadcastChannel !== "undefined") env.BroadcastChannelCtor = BroadcastChannel as unknown as BroadcastCtor;
  try {
    if (typeof localStorage !== "undefined") env.storage = localStorage;
  } catch {
    /* access denied */
  }
  if (typeof window !== "undefined") env.target = window as unknown as StorageTarget;
  return env;
}

/** BroadcastChannel if available, else `storage` events, else a no-op. Never throws. */
export function createTransport(self: string, env: TransportEnv = defaultEnv()): Transport {
  if (env.BroadcastChannelCtor) {
    try {
      return broadcastTransport(self, env.BroadcastChannelCtor);
    } catch {
      /* fall through to storage */
    }
  }
  if (env.storage && env.target) return storageTransport(self, env.storage, env.target);
  return { kind: "none", post: () => undefined, subscribe: () => () => undefined, close: () => undefined };
}

export interface MemoryBus {
  connect(self: string): Transport;
  /** Every envelope posted, in order. */
  readonly log: Envelope[];
}

/** In-process transport for tests (and later phases). Messages round-trip through encode/parse. */
export function createMemoryBus(): MemoryBus {
  const peers = new Map<symbol, ReturnType<typeof createDispatcher>>();
  const log: Envelope[] = [];
  return {
    log,
    connect(self) {
      const id = Symbol(self);
      const d = createDispatcher(self);
      let closed = false;
      peers.set(id, d);
      return {
        kind: "memory",
        post(env) {
          if (closed) return;
          log.push(env);
          const raw = encodeEnvelope(env);
          for (const [pid, p] of peers) if (pid !== id) p.dispatch(raw);
        },
        subscribe: d.subscribe,
        close() {
          closed = true;
          peers.delete(id);
          d.clear();
        },
      };
    },
  };
}