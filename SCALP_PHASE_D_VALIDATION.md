# SCALP — Phase D: Validation (the go / no-go gate)

**Goal:** decide, honestly, whether the Phase C scalper has **positive net
expectancy per trade after the real spread** — and whether it survives
walk-forward, cost stress, and per-session/per-fold consistency. This is where the
project is proven or killed.

**Depends on:** Phase B (engine), Phase C (strategy), Phase A (real spread).

---

## The single number that matters
**Net expectancy per trade in pips (and $), after bid/ask fills.** If it is <= 0,
no trade count or session saves it — more trades multiply a negative.

## Tasks
- [ ] **D1. Baseline run.** Full EUR_USD M1 history through Phase B + Phase C.
  Report: n, trades/day, win%, net expectancy (pips & $), profit factor, maxDD,
  $/day, avg hold, max losing streak.
- [ ] **D2. Walk-forward.** 5 expanding folds; report each fold's net expectancy
  separately. Edge must be positive in >= 4/5 folds.
- [ ] **D3. Bootstrap significance.** 20k resamples of per-trade net R →
  expectancy 95% CI and P(expectancy <= 0). Require **CI lower bound > 0**.
- [ ] **D4. Cost sensitivity.** Re-run at measured spread, measured + 0.3 pip,
  measured x 1.5, and fixed 1.5 pip. Report break-even spread. If it only works
  below the spread you'll actually pay live, it fails.
- [ ] **D5. Session / hour split.** Net expectancy by London vs NY vs hour — but
  do NOT keep only the best hours (fitting to noise); require a broad effect.
- [ ] **D6. MAE/MFE discovery.** Distribution of max adverse/favorable excursion
  in pips → set tp/sl once from it, re-validate OOS. No grid search.
- [ ] **D7. Trade independence.** Cluster rapid re-entries; report effective
  sample size; confirm results aren't a few correlated runs.
- [ ] **D8. Multiple-testing log.** Record every config in `SCALP_EXPERIMENT_LOG.md`;
  do not cherry-pick the best of many.

## Deliverables
- `research/scalp_validate.py` (walk-forward + bootstrap + cost + session).
- `SCALP_FINDINGS.md` (verdict) + `SCALP_TRADES.csv` (per-trade).

## Exit criteria (go / no-go)
- **GO:** net expectancy per trade > 0 with bootstrap CI lower bound > 0, positive
  in >= 4/5 folds, still positive at measured spread + 0.3 pip. → Phase E.
- **NO-GO:** anything else → stop, write the honest finding, do not tune to green.

## Reality note
This is the same gauntlet that killed the ML model and the H1/M5 confluence tests.
It is deliberately hard because a passing result must be real enough to risk money
on. Expect it to be strict; that strictness is the point.
