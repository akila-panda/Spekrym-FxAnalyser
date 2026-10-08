import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CandleQuery, DataSource } from "@/api/dataSource";
import { ApiError } from "@/api/client";
import type { Candle } from "@/types/market";
import { useCandles } from "./useCandles";

const bar = (time: number): Candle => ({ time, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 });
const run = (from: number, n: number) => Array.from({ length: n }, (_, i) => bar(from + i * 60));

interface Pending { q: CandleQuery; resolve: (c: Candle[]) => void; reject: (e: unknown) => void; signal?: AbortSignal }
function fakeSource() {
  const pending: Pending[] = [];
  const source = {
    kind: "mock",
    getCandles: vi.fn((q: CandleQuery, signal?: AbortSignal) => new Promise<Candle[]>((resolve, reject) => { pending.push({ q, resolve, reject, signal }); })),
  } as unknown as DataSource;
  return { source, pending };
}

describe("useCandles", () => {
  it("drops responses for stale inputs", async () => {
    const { source, pending } = fakeSource();
    const { result, rerender } = renderHook((p: { pair: "EUR_USD" | "GBP_USD" }) => useCandles({ pair: p.pair, tf: "M5", asOf: null, source, initialBars: 3 }), { initialProps: { pair: "EUR_USD" } });
    expect(result.current.status).toBe("loading");
    rerender({ pair: "GBP_USD" });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]?.signal?.aborted).toBe(true);
    act(() => pending[1]?.resolve(run(1000, 3)));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => pending[0]?.resolve(run(5000, 3))); // late answer for EUR_USD
    expect(result.current.candles.map((c) => c.time)).toEqual([1000, 1060, 1120]);
  });

  it("loads older bars once at a time, merges without duplicates, and stops at the start", async () => {
    const { source, pending } = fakeSource();
    const { result } = renderHook(() => useCandles({ pair: "EUR_USD", tf: "M5", asOf: 9999, source, initialBars: 3, olderBars: 3 }));
    expect(pending[0]?.q).toMatchObject({ to: 9999, limit: 3 });
    act(() => pending[0]?.resolve(run(1000, 3)));
    await waitFor(() => expect(result.current.hasMoreOlder).toBe(true));
    let a!: Promise<number>;
    let b!: Promise<number>;
    act(() => { a = result.current.loadOlder(); b = result.current.loadOlder(); });
    expect(await b).toBe(0);
    expect(pending).toHaveLength(2);
    expect(pending[1]?.q).toMatchObject({ before: 1000, limit: 3 });
    act(() => pending[1]?.resolve([...run(880, 3), bar(1000)])); // overlaps the first bar
    expect(await a).toBe(2); // 1000 was already loaded
    await waitFor(() => expect(result.current.candles).toHaveLength(5));
    expect(result.current.candles.map((c) => c.time)).toEqual([880, 940, 1000, 1060, 1120]);
    act(() => { void result.current.loadOlder(); });
    act(() => pending[2]?.resolve([bar(820)])); // short batch: start of data
    await waitFor(() => expect(result.current.hasMoreOlder).toBe(false));
  });

  it("reports errors, ignores aborts, and retries on reload", async () => {
    const { source, pending } = fakeSource();
    const { result } = renderHook(() => useCandles({ pair: "EUR_USD", tf: "M5", asOf: null, source, initialBars: 2 }));
    act(() => pending[0]?.reject(new ApiError("network", "offline")));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toBe("offline");
    act(() => result.current.reload());
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(result.current.status).toBe("loading");
    act(() => pending[1]?.resolve(run(0, 2)));
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});