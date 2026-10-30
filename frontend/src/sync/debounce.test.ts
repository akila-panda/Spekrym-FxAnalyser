import { debounce } from "./debounce";

describe("W2 debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once with the last arguments after the delay", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1);
    d(2);
    d(3);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(49);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });
  it("restarts the timer on each call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d("a");
    vi.advanceTimersByTime(40);
    d("b");
    vi.advanceTimersByTime(40);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledWith("b");
  });
  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1);
    expect(d.pending()).toBe(true);
    d.cancel();
    expect(d.pending()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
  it("flush runs the pending call immediately, once", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(7);
    d.flush();
    expect(fn).toHaveBeenCalledWith(7);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});