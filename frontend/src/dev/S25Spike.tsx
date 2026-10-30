/** THROWAWAY (S2.5). Open /?spike=lwc in dev. Probes lightweight-charts v5 semantics and prints results.
 *  Delete after S4-S6 are built. Not imported by the app. */
import { CandlestickSeries, createChart, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { getDataset } from "@/api/mock/generateCandles";

const ts = (n: number) => n as UTCTimestamp;
const iso = (s: number | null | undefined) => (s == null ? "null" : new Date(s * 1000).toISOString().slice(0, 16) + "Z");
const toData = (c: readonly { time: number; open: number; high: number; low: number; close: number }[]) =>
  c.map((x) => ({ time: ts(x.time), open: x.open, high: x.high, low: x.low, close: x.close }));

interface Pane { chart: IChartApi; series: ISeriesApi<"Candlestick"> }

export function S25Spike() {
  const topEl = useRef<HTMLDivElement>(null);
  const botEl = useRef<HTMLDivElement>(null);
  const top = useRef<Pane | null>(null);
  const bot = useRef<Pane | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const say = (s: string) => setLog((l) => [...l, s]);
  const ds = getDataset("EUR_USD");

  useEffect(() => {
    const mk = (el: HTMLDivElement, data: ReturnType<typeof toData>): Pane => {
      const chart = createChart(el, { autoSize: true, timeScale: { timeVisible: true } });
      const series = chart.addSeries(CandlestickSeries);
      series.setData(data);
      return { chart, series };
    };
    top.current = mk(topEl.current!, toData(ds.H1));
    bot.current = mk(botEl.current!, toData(ds.M5));
    top.current.chart.timeScale().fitContent();
    bot.current.chart.timeScale().fitContent();
    return () => {
      top.current?.chart.remove();
      bot.current?.chart.remove();
    };
  }, [ds]);

  const probeCoords = () => {
    const b = bot.current!;
    const fri = Date.UTC(2025, 3, 11, 23, 0, 0) / 1000; // inside the weekend gap
    const real = ds.M5[ds.M5.length >> 1]!.time;
    const ms = b.chart.timeScale();
    say(`[coords] real bar ${iso(real)} -> x=${ms.timeToCoordinate(ts(real))}, idx=${ms.timeToIndex(ts(real), false)}`);
    say(`[coords] gap time ${iso(fri)} -> x=${ms.timeToCoordinate(ts(fri))}, idx(exact)=${ms.timeToIndex(ts(fri), false)}, idx(nearest)=${ms.timeToIndex(ts(fri), true)}`);
    const off = real + 90; // between two M5 bars
    say(`[coords] off-grid ${iso(off)} -> x=${ms.timeToCoordinate(ts(off))}, idx(exact)=${ms.timeToIndex(ts(off), false)}, idx(nearest)=${ms.timeToIndex(ts(off), true)}`);
    const x = ms.timeToCoordinate(ts(real));
    if (x != null) say(`[coords] coordinateToTime(${x}) -> ${iso(ms.coordinateToTime(x) as number | null)}; x+1000(off-data) -> ${ms.coordinateToTime(x + 1000)}`);
  };

  const probeCrosshair = () => {
    const t = top.current!;
    const b = bot.current!;
    let fired = 0;
    const h = () => { fired++; };
    t.chart.subscribeCrosshairMove(h);
    const real = ds.M5[ds.M5.length >> 1]!.time; // an M5 time that is not an H1 open
    const price = ds.M5[ds.M5.length >> 1]!.close;
    t.chart.setCrosshairPosition(price, ts(real), t.series);
    say(`[crosshair] setCrosshairPosition(M5 time ${iso(real)}) on H1 chart fired subscribeCrosshairMove ${fired}x (re-entrancy risk if >0)`);
    fired = 0;
    t.chart.setCrosshairPosition(NaN, ts(real), t.series);
    say(`[crosshair] price=NaN: fired ${fired}x (is a finite price required?)`);
    t.chart.clearCrosshairPosition();
    t.chart.unsubscribeCrosshairMove(h);
    void b;
  };

  const probeRange = () => {
    const t = top.current!;
    const b = bot.current!;
    let n = 0;
    const link = (from: Pane, to: Pane, guard: boolean) => {
      let applying = false;
      const cb = () => {
        if (guard && applying) return;
        n++;
        if (n > 50) return;
        const r = from.chart.timeScale().getVisibleLogicalRange();
        if (!r) return;
        applying = true;
        to.chart.timeScale().setVisibleLogicalRange(r);
        applying = false;
      };
      from.chart.timeScale().subscribeVisibleLogicalRangeChange(cb);
      return () => from.chart.timeScale().unsubscribeVisibleLogicalRangeChange(cb);
    };
    const u1 = link(t, b, false);
    const u2 = link(b, t, false);
    t.chart.timeScale().setVisibleLogicalRange({ from: 5, to: 40 });
    setTimeout(() => {
      say(`[range] unguarded two-way link: ${n} callbacks after one set (capped at 50; >2 = ping-pong)`);
      u1(); u2();
      n = 0;
      const g1 = link(t, b, true);
      const g2 = link(b, t, true);
      t.chart.timeScale().setVisibleLogicalRange({ from: 10, to: 60 });
      setTimeout(() => { say(`[range] guarded link: ${n} callbacks`); g1(); g2(); }, 200);
    }, 200);
  };

  const probeClamp = () => {
    const b = bot.current!;
    const first = ds.M5[0]!.time;
    b.chart.timeScale().setVisibleRange({ from: ts(first - 86400 * 30), to: ts(first + 3600) });
    const r = b.chart.timeScale().getVisibleRange();
    const lr = b.chart.timeScale().getVisibleLogicalRange();
    say(`[clamp] asked from first-30d; got ${iso(r?.from as number | undefined)}..${iso(r?.to as number | undefined)}; logical from=${lr?.from} (negative = room left of data)`);
  };

  const probeReplay = () => {
    const b = bot.current!;
    const asOf = ds.M5[Math.floor(ds.M5.length / 2)]!.time;
    b.series.setData(toData(ds.M5.filter((c) => c.time + 300 <= asOf)));
    const r = b.chart.timeScale().getVisibleRange();
    say(`[replay] setData truncated at asOf ${iso(asOf)}; visible ${iso(r?.from as number | undefined)}..${iso(r?.to as number | undefined)}; future x for asOf+1h = ${b.chart.timeScale().timeToCoordinate(ts(asOf + 3600))}`);
  };

  const reset = () => {
    bot.current!.series.setData(toData(ds.M5));
    bot.current!.chart.timeScale().fitContent();
    top.current!.chart.timeScale().fitContent();
  };

  return (
    <div style={{ padding: 8, font: "12px system-ui", color: "var(--text, #222)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        <button onClick={probeCoords}>coords</button>
        <button onClick={probeCrosshair}>crosshair</button>
        <button onClick={probeRange}>range sync</button>
        <button onClick={probeClamp}>clamp</button>
        <button onClick={probeReplay}>replay</button>
        <button onClick={reset}>reset</button>
        <button onClick={() => setLog([])}>clear</button>
      </div>
      <div ref={topEl} style={{ height: 220 }} />
      <div ref={botEl} style={{ height: 220, marginTop: 4 }} />
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }} aria-live="polite">{log.join("\n")}</pre>
    </div>
  );
}

export type _Unused = Time;