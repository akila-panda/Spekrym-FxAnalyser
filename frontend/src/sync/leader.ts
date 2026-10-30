/** The subset of `navigator.locks` that we use. */
export interface LockManagerLike {
  request(name: string, callback: (lock: unknown) => unknown): Promise<unknown>;
  request(name: string, options: { ifAvailable?: boolean }, callback: (lock: unknown) => unknown): Promise<unknown>;
}

export const LEADER_LOCK = "spekrym:leader";

export function defaultLocks(): LockManagerLike | null {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return null;
  return navigator.locks as unknown as LockManagerLike;
}

export interface Leader {
  isLeader(): boolean;
  dispose(): void;
}

/**
 * Holds an exclusive Web Lock for the window's lifetime. The browser hands it to the next waiter when the
 * holder closes or crashes, so no heartbeat is needed. Without Web Locks every window counts as leader
 * (duplicate snapshot replies are dropped by revision ordering).
 */
export function createLeader(mgr: LockManagerLike | null = defaultLocks(), name = LEADER_LOCK): Leader {
  if (!mgr) return { isLeader: () => true, dispose: () => undefined };
  let leader = false;
  let disposed = false;
  let releaseLock: (() => void) | undefined;
  mgr
    .request(name, () => {
      if (disposed) return undefined;
      leader = true;
      return new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
    })
    .catch(() => undefined);
  return {
    isLeader: () => leader,
    dispose() {
      disposed = true;
      leader = false;
      releaseLock?.();
    },
  };
}