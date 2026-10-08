import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import { floorTo } from "@/lib/time";
import { TF_SECONDS, type Timeframe } from "@/types/market";
import type { ScanResult } from "@/types";

/** One small marker per setup, on the chart it was scanned on. */
export interface Pin {
  key: string;
  tf: Timeframe;
  id: string;
  /** UTC seconds, snapped to the bar the setup starts on. */
  time: number;
  status: "valid" | "rejected";
  result?: "win" | "loss" | "flat";
}

export const pinKey = (tf: Timeframe, id: string): string => `${tf}:${id}`;

export function buildPins(tf: Timeframe, result: ScanResult | undefined): Pin[] {
  if (!result) return [];
  return result.setups
    .map((s): Pin => {
      const trade = s.annotations.find((a) => a.kind === "trade");
      const anchor = trade ? trade.t0 : s.focus.from;
      return {
        key: pinKey(tf, s.id), tf, id: s.id, time: floorTo(anchor, TF_SECONDS[tf]),
        status: s.status, result: s.outcome?.result,
      };
    })
    .sort((a, b) => a.time - b.time);
}

export interface PinColors {
  up: string;
  down: string;
  muted: string;
}

/** Valid = circle, rejected = square (shape, not only colour). Colour = outcome. The active pin is larger. */
export function pinMarkers(pins: readonly Pin[], activeKey: string | null, c: PinColors): SeriesMarker<Time>[] {
  return pins.map((p) => ({
    time: p.time as UTCTimestamp,
    position: "aboveBar",
    shape: p.status === "valid" ? "circle" : "square",
    color: p.result === "win" ? c.up : p.result === "loss" ? c.down : c.muted,
    size: p.key === activeKey ? 2 : 1,
  }));
}

export interface PinGeometry {
  /** CSS px for a bar time, or null when off screen. */
  timeX: (t: number) => number | null;
  /** CSS px of the top of the bar at that time, or null when there is none. */
  highY: (t: number) => number | null;
}

/** The pin under the pointer: within `tol` px across, and in the band just above its bar. */
export function hitPin(pins: readonly Pin[], x: number, y: number, g: PinGeometry, tol = 8): Pin | null {
  let best: { pin: Pin; d: number } | null = null;
  for (const p of pins) {
    const px = g.timeX(p.time);
    const py = g.highY(p.time);
    if (px === null || py === null) continue;
    const dx = Math.abs(x - px);
    if (dx > tol || y > py + 4 || y < py - 30) continue;
    if (!best || dx < best.d) best = { pin: p, d: dx };
  }
  return best?.pin ?? null;
}