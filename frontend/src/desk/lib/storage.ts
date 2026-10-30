/** DESK DK0 — versioned local-store helper. Mirrors review/reviewStore's discipline: pure parse,
 *  try/catch load/save, drop-on-corrupt, a version field and a migrate() stub, plus a size cap.
 *  All Desk persistence is local only (never replicated). Keys: spekrym.desk.<name>.v<version>. */

export interface LocalStoreSpec<T> {
  /** Base key, e.g. "decisions" → "spekrym.desk.decisions.v1". */
  name: string;
  version: number;
  /** Validate + coerce an unknown payload into T, or return `empty()` on anything invalid. */
  parse: (raw: unknown) => T;
  /** Value when absent/corrupt. */
  empty: () => T;
  /** Optional migration from an older stored version. Default: discard (return empty). */
  migrate?: (oldVersion: number, data: unknown) => T | null;
  /** Max serialized bytes before `save` refuses and calls onQuota. Default 1 MiB. */
  maxBytes?: number;
  /** Called when a save is skipped for quota; caller should prune. */
  onQuota?: (bytes: number) => void;
}

export interface LocalStore<T> {
  key: string;
  load: () => T;
  save: (value: T) => boolean;
  clear: () => void;
}

export function deskKey(name: string, version: number): string {
  return `spekrym.desk.${name}.v${version}`;
}

export function createLocalStore<T>(spec: LocalStoreSpec<T>): LocalStore<T> {
  const key = deskKey(spec.name, spec.version);
  const maxBytes = spec.maxBytes ?? 1_048_576;

  const load = (): T => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return spec.empty();
      const env = JSON.parse(raw) as { version?: number; data?: unknown };
      if (!env || typeof env !== "object") return spec.empty();
      if (env.version === spec.version) return spec.parse(env.data);
      const migrated = spec.migrate?.(env.version ?? 0, env.data);
      return migrated ?? spec.empty();
    } catch {
      return spec.empty();
    }
  };

  const save = (value: T): boolean => {
    try {
      const body = JSON.stringify({ version: spec.version, data: value });
      const bytes = body.length;
      if (bytes > maxBytes) {
        spec.onQuota?.(bytes);
        return false;
      }
      localStorage.setItem(key, body);
      return true;
    } catch (e) {
      // QuotaExceededError or storage unavailable: report, do not throw.
      spec.onQuota?.(-1);
      void e;
      return false;
    }
  };

  const clear = (): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  return { key, load, save, clear };
}
