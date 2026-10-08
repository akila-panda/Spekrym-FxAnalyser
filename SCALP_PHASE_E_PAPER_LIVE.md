# SCALP — Phase E: Paper Trading → Gated Live

**Goal:** run the validated scalper live on the OANDA **practice** account on 1m,
confirm real fills/slippage match the backtest, and only then allow a tiny
(0.01 lot) live deployment behind hard risk limits.

**ENTER THIS PHASE ONLY IF PHASE D RETURNED "GO".** If Phase D was NO-GO, do not
paper-trade a negative-expectancy system.

**Depends on:** Phase A–D. Reuses `data/oanda_client.py`, the `agents/service.py`
live-loop pattern, and the stub `paper_trading/` and `tracking/` modules.

---

## Tasks
- [ ] **E1. Live signal service.** `paper_trading/scalp_service.py`: on each
  closed M1 bar (poll aligned to minute close), rebuild the causal context and run
  the Phase C strategy; emit a signal with entry/SL/TP.
- [ ] **E2. Paper execution.** Place the trade on the OANDA **practice** account
  via `oanda_client` (market order, 0.01-lot units, with SL/TP). Record the
  **actual fill price and actual spread** at execution.
- [ ] **E3. Fill-vs-backtest tracking.** `tracking/scalp_tracker.py`: log
  {signal_ts, intended_entry, actual_fill, slippage_pips, spread_at_fill, exit,
  net_pips, net_$}. Compare live slippage/spread to the Phase A assumptions.
- [ ] **E4. Accuracy dashboard.** Rolling live net expectancy vs backtest
  expectancy; alert if live underperforms backtest by > X (execution reality gap).
- [ ] **E5. Risk guardrails (hard):** max trades/day, max daily loss ($ and R),
  max concurrent positions, auto-halt on daily-loss breach, no trading around
  high-impact calendar events (reuse `data/fetch_calendar`).
- [ ] **E6. Gated live.** Only after **N weeks** of paper where live expectancy
  ≈ backtest (within tolerance) → enable 0.01 lot live, same guardrails, monitored.

## Deliverables
- `paper_trading/scalp_service.py`, `tracking/scalp_tracker.py`, live-vs-backtest report.

## Exit criteria
1. Paper live for a pre-set window; **live net expectancy within tolerance of
   backtest** (catches slippage/latency the backtest cannot).
2. Guardrails proven to halt on daily-loss breach in a drill.
3. Only then: tiny live, with the same halt logic.

## Reality notes
- 1m execution on a retail feed has latency, requotes, and variable spread the
  backtest cannot fully model — E3/E4 exist precisely to measure that gap.
- A strategy that looked good in backtest but degrades on paper **stops here** —
  do not go live to "see if it works."
- True sub-second HFT is not retail-accessible; this is many-trades-per-day 1m
  systematic scalping (holds of seconds-to-minutes), not microstructure HFT.

---

## Development order
Build strictly A → B → C → D → E. Do not skip A (real spread) or D (the gate).
Phase B and Phase C are the core; A feeds them the truth; D judges them; E only
runs if D says the edge is real.
