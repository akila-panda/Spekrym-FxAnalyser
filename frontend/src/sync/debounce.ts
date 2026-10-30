export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Drops the pending call. */
  cancel(): void;
  /** Runs the pending call now, if any. */
  flush(): void;
  pending(): boolean;
}

/** Trailing-edge debounce; the last arguments win. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: A | undefined;

  const fire = () => {
    timer = undefined;
    const args = last;
    last = undefined;
    if (args) fn(...args);
  };
  const call = (...args: A) => {
    last = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fire, ms);
  };
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    last = undefined;
  };
  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    fire();
  };
  const pending = () => timer !== undefined;

  return Object.assign(call, { cancel, flush, pending });
}