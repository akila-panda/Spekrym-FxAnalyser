import type { Transport } from "./channel";
import { makePresence, type Envelope } from "./protocol";

export interface PresencePayload {
  role: string;
  bye?: boolean;
}
export interface Peer {
  origin: string;
  role: string;
  seen: number;
}
export interface Presence {
  start(): void;
  /** Announces departure (best effort) and stops. */
  stop(): void;
  peers(): Peer[];
  count(): number;
  onChange(fn: (peers: Peer[]) => void): () => void;
  onLeave(fn: (origin: string) => void): () => void;
}

export interface PresenceOptions {
  self: string;
  role: string;
  transport: Transport;
  intervalMs?: number;
  /** Must exceed the interval comfortably: background tabs throttle timers. A late peer reappears on its next beat. */
  ttlMs?: number;
  now?: () => number;
}

export function validatePresence(raw: unknown): PresencePayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.role !== "string" || r.role.length === 0 || r.role.length > 32) return null;
  if (r.bye !== undefined && typeof r.bye !== "boolean") return null;
  return r.bye === true ? { role: r.role, bye: true } : { role: r.role };
}

/** Heartbeat presence. Departure is detected by missed beats, never by `beforeunload`. */
export function createPresence(o: PresenceOptions): Presence {
  const intervalMs = o.intervalMs ?? 2000;
  const ttlMs = o.ttlMs ?? 10000;
  const now = o.now ?? (() => Date.now());
  const peers = new Map<string, Peer>();
  const changeL = new Set<(p: Peer[]) => void>();
  const leaveL = new Set<(origin: string) => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let unsub: (() => void) | undefined;

  const list = (): Peer[] => [...peers.values()].sort((a, b) => (a.origin < b.origin ? -1 : 1));
  const emit = () => {
    const l = list();
    changeL.forEach((f) => f(l));
  };
  const beat = () => o.transport.post(makePresence(o.self, { role: o.role }));
  const drop = (origin: string) => {
    if (!peers.delete(origin)) return;
    leaveL.forEach((f) => f(origin));
    emit();
  };

  const onMessage = (env: Envelope) => {
    if (env.type !== "presence") return;
    const p = validatePresence(env.payload);
    if (!p) return;
    if (p.bye) return drop(env.origin);
    const prev = peers.get(env.origin);
    peers.set(env.origin, { origin: env.origin, role: p.role, seen: now() });
    if (!prev) {
      emit();
      beat(); // introduce ourselves to the newcomer straight away
    } else if (prev.role !== p.role) emit();
  };

  const sweep = () => {
    const t = now();
    for (const [origin, peer] of [...peers]) if (t - peer.seen > ttlMs) drop(origin);
  };

  return {
    start() {
      if (timer !== undefined) return;
      unsub = o.transport.subscribe(onMessage);
      beat();
      timer = setInterval(() => {
        beat();
        sweep();
      }, intervalMs);
    },
    stop() {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
      unsub?.();
      unsub = undefined;
      o.transport.post(makePresence(o.self, { role: o.role, bye: true }));
      peers.clear();
    },
    peers: list,
    count: () => peers.size,
    onChange(fn) {
      changeL.add(fn);
      return () => {
        changeL.delete(fn);
      };
    },
    onLeave(fn) {
      leaveL.add(fn);
      return () => {
        leaveL.delete(fn);
      };
    },
  };
}