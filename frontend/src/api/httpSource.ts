import { toIsoUtc } from "@/lib/time";
import { parseBounds, parseCandles, parseScanResult, parseStrategies } from "@/types";
import { requestJson } from "./client";
import { MAX_CANDLES, type CandleQuery, type DataSource } from "./dataSource";

export function createHttpSource(baseUrl = ""): DataSource {
  const get = (path: string, signal?: AbortSignal) => requestJson(path, { baseUrl, signal });
  return {
    kind: "api",
    async getCandles(q: CandleQuery, signal) {
      const p = new URLSearchParams({ pair: q.pair, tf: q.tf });
      if (q.from !== undefined) p.set("from", toIsoUtc(q.from));
      if (q.to !== undefined) p.set("to", toIsoUtc(q.to));
      if (q.before !== undefined) p.set("before", toIsoUtc(q.before));
      if (q.limit !== undefined) p.set("limit", String(Math.min(q.limit, MAX_CANDLES)));
      return parseCandles(await get(`/api/candles?${p}`, signal)).candles;
    },
    async getBounds(pair, signal) {
      return parseBounds(await get(`/api/bounds?pair=${encodeURIComponent(pair)}`, signal));
    },
    async getStrategies(signal) {
      return parseStrategies(await get("/api/strategies", signal));
    },
    async runScan(req, signal) {
      return parseScanResult(await requestJson("/api/scan", { baseUrl, method: "POST", body: req, signal, timeoutMs: 120000 }));
    },
  };
}