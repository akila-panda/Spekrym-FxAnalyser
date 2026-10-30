import type { LockManagerLike } from "./leader";

/** In-memory exclusive lock manager for tests. Mirrors `navigator.locks` semantics for the options we use. */
export function createFakeLocks(): LockManagerLike & { heldNames(): string[] } {
  const held = new Set<string>();
  const queues = new Map<string, Array<() => void>>();

  const run = async (name: string, cb: (lock: unknown) => unknown): Promise<unknown> => {
    held.add(name);
    try {
      return await cb({ name });
    } finally {
      held.delete(name);
      queues.get(name)?.shift()?.();
    }
  };

  const mgr = {
    heldNames: () => [...held],
    request(name: string, a: unknown, b?: unknown): Promise<unknown> {
      const cb = (typeof a === "function" ? a : b) as (lock: unknown) => unknown;
      const opts = (typeof a === "function" ? {} : a) as { ifAvailable?: boolean };
      if (!held.has(name)) return run(name, cb);
      if (opts.ifAvailable) return Promise.resolve(cb(null));
      return new Promise((resolve, reject) => {
        const q = queues.get(name) ?? [];
        queues.set(name, q);
        q.push(() => {
          run(name, cb).then(resolve, reject);
        });
      });
    },
  };
  return mgr as unknown as LockManagerLike & { heldNames(): string[] };
}