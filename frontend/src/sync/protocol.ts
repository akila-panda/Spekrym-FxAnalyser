export const PROTOCOL_VERSION = 1;
export const CHANNEL_NAME = "spekrym";

export const DATA_SLICES = ["view", "scan", "scanResults", "annotation", "overrides", "panel", "cursor"] as const;
export type DataSlice = (typeof DATA_SLICES)[number];
/** `all` is only valid on `hello` and `presence`. */
export type Slice = DataSlice | "all";

export const MESSAGE_TYPES = ["hello", "state", "delta", "cursor", "presence"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface Envelope {
  protocolVersion: number;
  type: MessageType;
  slice: Slice;
  revision: number;
  origin: string;
  payload: unknown;
}

/** LOCAL: user/app mutation (broadcast). REMOTE: applied from a peer (never re-broadcast). DERIVED: recomputed from other state (never broadcast). */
export type MutationTag = "LOCAL" | "REMOTE" | "DERIVED";
export const shouldBroadcast = (tag: MutationTag): boolean => tag === "LOCAL";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/** Builds an envelope. `undefined` payloads become `null` so JSON round-trips are lossless. */
export function makeEnvelope(
  type: MessageType, slice: Slice, revision: number, origin: string, payload: unknown,
): Envelope {
  return { protocolVersion: PROTOCOL_VERSION, type, slice, revision, origin, payload: payload ?? null };
}

export const makeHello = (origin: string): Envelope => makeEnvelope("hello", "all", 0, origin, null);
export const makePresence = (origin: string, payload: { role: string; bye?: boolean }): Envelope =>
  makeEnvelope("presence", "all", 0, origin, payload);

export const encodeEnvelope = (env: Envelope): string => JSON.stringify(env);

/** Accepts a JSON string or an already-cloned object. Returns null on any shape or version mismatch; never throws. */
export function parseEnvelope(raw: unknown): Envelope | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(v)) return null;
  const { protocolVersion, type, slice, revision, origin } = v;
  if (protocolVersion !== PROTOCOL_VERSION) return null;
  if (!isOneOf(MESSAGE_TYPES, type)) return null;
  if (slice !== "all" && !isOneOf(DATA_SLICES, slice)) return null;
  if ((type === "cursor") !== (slice === "cursor")) return null;
  if (slice === "all" && type !== "hello" && type !== "presence") return null;
  if (type === "presence" && slice !== "all") return null;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) return null;
  if (typeof origin !== "string" || origin.length === 0 || origin.length > 64) return null;
  if (!("payload" in v)) return null;
  const payload = v.payload;
  if (type !== "hello" && (payload === null || payload === undefined)) return null;
  return { protocolVersion, type, slice, revision, origin, payload: payload ?? null };
}

/** True when the message came from this window. */
export const isEcho = (env: Pick<Envelope, "origin">, self: string): boolean => env.origin === self;

export interface RemoteGuard {
  readonly active: boolean;
  /** Runs `fn` with the guard raised (re-entrant). Mutations made inside are REMOTE. */
  run<T>(fn: () => T): T;
  /** Tag for a mutation happening right now. */
  tag(derived?: boolean): MutationTag;
}

export function createRemoteGuard(): RemoteGuard {
  let depth = 0;
  return {
    get active() {
      return depth > 0;
    },
    run(fn) {
      depth += 1;
      try {
        return fn();
      } finally {
        depth -= 1;
      }
    },
    tag(derived = false) {
      if (derived) return "DERIVED";
      return depth > 0 ? "REMOTE" : "LOCAL";
    },
  };
}

/** Short random window id. `rand` is injectable for tests. */
export function makeOrigin(rand: () => number = Math.random): string {
  const part = () => Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0");
  return `w-${part()}${part()}`;
}