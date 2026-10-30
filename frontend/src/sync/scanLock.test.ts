import { createFakeLocks } from "./fakeLocks";
import { paramsHash, scanLockKey, withScanLock, type ScanKeyInput } from "./scanLock";

const base: ScanKeyInput = {
  tf: "M5", pair: "EUR_USD", strategy: "s1", params: { a: 1, b: "x" }, asOf: null,
  range: { from: "2026-01-01", to: "2026-01-05" },
};

describe("W3b scan lock key", () => {
  it("is independent of param order", () => {
    expect(paramsHash({ a: 1, b: 2 })).toBe(paramsHash({ b: 2, a: 1 }));
    expect(scanLockKey(base)).toBe(scanLockKey({ ...base, params: { b: "x", a: 1 } }));
  });
  it("differs when any input differs", () => {
    const k = scanLockKey(base);
    for (const patch of [
      { tf: "H1" as const }, { pair: "GBP_USD" }, { strategy: "s2" }, { params: { a: 2, b: "x" } },
      { asOf: 1700000000 }, { range: { from: "2026-01-01", to: "2026-01-06" } }, { range: null },
    ]) {
      expect(scanLockKey({ ...base, ...patch })).not.toBe(k);
    }
  });
});

describe("W3b withScanLock", () => {
  it("skips a duplicate run of the same key and allows it again afterwards", async () => {
    const locks = createFakeLocks();
    let finish!: () => void;
    const first = withScanLock("k", () => new Promise<number>((r) => { finish = () => r(1); }), locks);
    expect(await withScanLock("k", async () => 2, locks)).toEqual({ ran: false });
    finish();
    expect(await first).toEqual({ ran: true, value: 1 });
    expect(await withScanLock("k", async () => 3, locks)).toEqual({ ran: true, value: 3 });
  });
  it("runs different keys concurrently", async () => {
    const locks = createFakeLocks();
    let finish!: () => void;
    const first = withScanLock("k1", () => new Promise<number>((r) => { finish = () => r(1); }), locks);
    expect(await withScanLock("k2", async () => 2, locks)).toEqual({ ran: true, value: 2 });
    finish();
    await first;
  });
  it("releases the lock when fn throws", async () => {
    const locks = createFakeLocks();
    await expect(withScanLock("k", async () => { throw new Error("boom"); }, locks)).rejects.toThrow("boom");
    expect(await withScanLock("k", async () => 1, locks)).toEqual({ ran: true, value: 1 });
  });
  it("always runs without Web Locks, starting synchronously", async () => {
    let started = false;
    const p = withScanLock("k", async () => { started = true; return 7; }, null);
    expect(started).toBe(true);
    expect(await p).toEqual({ ran: true, value: 7 });
  });
});