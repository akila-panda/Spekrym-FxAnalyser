/** DEV ONLY catalog. Same shape the backend sends (docs/SCAN_CONTRACT.md). */
import type { StrategyDef } from "@/types";

export const MOCK_STRATEGIES: StrategyDef[] = [
  {
    id: "orb",
    name: "Opening range breakout",
    description: "Break of the first N minutes after a session open, stop at the range width. (Mock logic.)",
    supported_timeframes: ["M1", "M5", "M15"],
    context_timeframes: ["H1", "H4"],
    display_tz: "UTC",
    signal_class: "hybrid",
    indicators_used: ["ATR(14)", "VWAP"],
    params: [
      { key: "session_open", label: "Session open (UTC)", type: "time", default: "07:00" },
      { key: "mode", label: "Mode", type: "select", default: "breakout", options: ["breakout", "fade"] },
      { key: "range_min", label: "Range length", type: "integer", default: 15, min: 5, max: 120, step: 5, unit: "min" },
      { key: "entry_window_min", label: "Entry window", type: "integer", default: 180, min: 15, max: 480, step: 15, unit: "min" },
      { key: "target_mult", label: "Target (x range)", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5 },
      { key: "min_stop_pips", label: "Min stop", type: "number", default: 6, min: 1, max: 100, step: 0.5, unit: "pips" },
      { key: "max_stop_pips", label: "Max stop", type: "number", default: 40, min: 5, max: 200, step: 1, unit: "pips" },
      { key: "use_vwap", label: "VWAP filter", type: "boolean", default: true },
      { key: "use_volume", label: "Volume filter", type: "boolean", default: false },
    ],
  },
  {
    id: "silver_bullet",
    name: "Silver Bullet",
    description: "One-hour window: sweep, market structure shift, fair value gap, entry. (Mock logic.)",
    supported_timeframes: ["M1", "M5"],
    context_timeframes: ["H1", "H4"],
    display_tz: "America/New_York",
    signal_class: "price_only",
    indicators_used: [],
    params: [
      { key: "window", label: "Window", type: "select", default: "ny_am", options: ["london", "ny_am", "ny_pm", "all"] },
      { key: "min_gap_pips", label: "Min gap size", type: "number", default: 1, min: 0.5, max: 10, step: 0.5, unit: "pips" },
      { key: "require_sweep", label: "Require sweep", type: "boolean", default: true },
      { key: "reward_mult", label: "Reward multiple", type: "number", default: 2, min: 1, max: 5, step: 0.5 },
    ],
  },
  {
    id: "ma_cross",
    name: "MA cross",
    description: "Fast/slow moving-average crossover with an ADX trend filter. (Mock logic.)",
    supported_timeframes: ["M5", "M15", "H1"],
    context_timeframes: ["H4"],
    display_tz: "UTC",
    signal_class: "indicator",
    indicators_used: ["EMA(20)", "EMA(50)", "ADX(14)"],
    params: [
      { key: "fast", label: "Fast EMA", type: "integer", default: 20, min: 2, max: 100, step: 1 },
      { key: "slow", label: "Slow EMA", type: "integer", default: 50, min: 5, max: 400, step: 1 },
      { key: "adx_min", label: "Min ADX", type: "number", default: 20, min: 0, max: 60, step: 1 },
    ],
  },
];