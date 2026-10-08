import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, requestJson } from "./client";
import { createDataSource } from "./sourceFactory";
import { createMockSource } from "./mock/mockSource";

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("requestJson", () => {
  it("returns parsed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: 1 })));
    expect(await requestJson("/x")).toEqual({ ok: 1 });
  });
  it("maps http errors with the backend detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "bad range" }, 422)));
    await expect(requestJson("/x")).rejects.toMatchObject({ kind: "http", status: 422, message: "bad range" });
  });
  it("maps network failures, caller aborts and timeouts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(requestJson("/x")).rejects.toMatchObject({ kind: "network" });
    const ctl = new AbortController();
    ctl.abort();
    await expect(requestJson("/x", { signal: ctl.signal })).rejects.toMatchObject({ kind: "aborted" });
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })));
    await expect(requestJson("/x", { timeoutMs: 10 })).rejects.toMatchObject({ kind: "timeout" });
  });
  it("flags non-JSON bodies as contract errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(requestJson("/x")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("sources", () => {
  it("factory picks mock by default and api when asked", () => {
    expect(createDataSource({}).kind).toBe("mock");
    expect(createDataSource({ VITE_DATA_SOURCE: "api", VITE_API_BASE: "http://x" }).kind).toBe("api");
    expect(() => createDataSource({ VITE_DATA_SOURCE: "zzz" })).toThrow();
  });
  it("mock source serves candles, bounds, strategies and honours abort", async () => {
    const src = createMockSource({ delayMs: 0, scanDelayMs: 0 });
    const bounds = await src.getBounds("EUR_USD");
    expect(bounds.bounds.M1.first).not.toBeNull();
    const last = bounds.bounds.M5.last ?? 0;
    const c = await src.getCandles({ pair: "EUR_USD", tf: "M5", before: last, limit: 10 });
    expect(c).toHaveLength(10);
    expect((c[9]?.time ?? 0) < last).toBe(true);
    expect((await src.getStrategies()).map((s) => s.id)).toEqual(["orb", "silver_bullet", "ma_cross"]);
    const ctl = new AbortController();
    const p = createMockSource({ delayMs: 50 }).getStrategies(ctl.signal);
    ctl.abort();
    await expect(p).rejects.toMatchObject({ kind: "aborted" });
  });
});