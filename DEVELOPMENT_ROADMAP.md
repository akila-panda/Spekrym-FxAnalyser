# Spekrym-FX — Development Roadmap

Master plan for building an **intraday (London + NY session) day-trading system**
that is validated by an **incorruptible research engine**, so that any edge we
ship is real rather than curve-fit. Versioned, phased, with a pre-committed
review gate after every phase and explicit decision branches based on findings.

> **Reading order for a new contributor:** this file → `HANDOFF_FOR_REVIEW.md`
> (the falsification rules) → `SCALP_FINDINGS.md` (why scalping is dead and what
> that taught us) → the version you're working on.

---

## 0. First principles (these override everything below)

1. **Referee before players.** The deterministic Judge (V0) is built *before* any
   strategy is tuned. We never evaluate a strategy with a tool the strategy's
   author can bend.
2. **Falsification-first.** Every experiment is pre-registered with a pass/fail
   gate *before* it runs. We try to break ideas, not to confirm them.
3. **Net of real cost, always.** Measured EUR/USD spread = **1.6 pips** (London/
   NY). In-sample or zero-cost results are rejected on sight.
4. **The information is the edge, not the module.** 7 prior tests proved EUR/USD
   single-series *scalping* has no edge (MFE p50=0.5 / MAE p50=4.1). We changed
   the **horizon** (intraday day-trade, not scalp) and the **structure** (session
   opens), because that is where intraday edge is documented — see §1.
5. **Multiple testing is the enemy.** Trying 40 variants and keeping the best
   *manufactures* a false positive. The Judge accounts for every experiment run.
6. **Kill criteria are pre-committed.** Each version has a condition under which we
   stop or pivot. We honour it instead of moving goalposts.
7. **Expectancy is the target, never win rate.** Win rate > 50% does not mean
   profitable (82% of >50%-win-rate retail traders still lose — losers dwarf
   winners). We optimise and gate on **expectancy net of cost**, never on win rate.

### The profitability target (how every gate is defined)
The bar is **positive expectancy net of the 1.6-pip cost**, expressed as *beating
the fair (random) win rate*:

```
Expectancy = P(win)·avg_win − P(loss)·avg_loss − cost
Random entry wins ≈ stop / (stop + target)     ← the "fair" rate, no edge
Edge = how far we beat the fair rate, persistently, out-of-sample, after cost
```

Bigger targets slash the edge we need — which is the whole reason this is a
day-trade, not a scalp (15-pip stop, 1.6-pip cost):

| Setup | Reward:Risk | Fair win rate | Break-even (after cost) | Edge over random needed |
|---|---|---|---|---|
| Scalp 5/4 pip | ~1.25:1 | 44% | 62% | **~18 pts** (hopeless) |
| Day-trade 1:1 | 1:1 | 50% | 55% | ~5 pts |
| **Day-trade 2:1** | **2:1** | **33%** | **37%** | **~4 pts** (reachable) |
| Day-trade 3:1 | 3:1 | 25% | 28% | ~3 pts |

At 2:1 we can **lose ~60% of trades and still profit weekly**. So the gates below
never ask for a high win rate — they ask us to **beat the fair win rate by a
margin that clears cost, per fold**.

### Honest expectation (read before investing time)
Intraday day-trading odds are structurally poor: ~5–16% of retail day traders are
net profitable long-term. Our approach is the least-bad version (session-open
structure, cost-survivable targets, rigorous validation). Realistic probability
this program finds a genuinely live-profitable EUR/USD intraday edge: **~20–35%**.
The most likely single outcome is a rigorous, documented "no durable edge" — which
is itself worth knowing. We proceed eyes-open, with kill criteria.

---

## 1. Evidence base (why this design)

- **Scalping is dead by arithmetic** — 5-pip target vs 1.6-pip spread gives 32% to
  cost; median favorable move is 0.5 pip. (`SCALP_FINDINGS.md`)
- **Day-trading with session-sized targets is cost-survivable** — a 25–40 pip
  target pays ~4–6% to spread, not 32%.
- **Intraday edge concentrates at session opens.** Opening Range Breakout (ORB)
  shows "mixed but generally positive" results in academic tests (mostly index
  futures/equities). Market Intraday Momentum (Gao/Han/Zhou, JFE 2018) is
  peer-reviewed but equity-index. London/NY FX breakout is plausible but mostly
  retail-blog evidence — **so FX survival after cost is the open question we test.**
- **Implication:** ORB at London (07:00 UTC) + NY (13:00 UTC) opens on EUR/USD is
  the first hypothesis family. If it fails, the same session-open logic has
  stronger evidence on an equity index (NY session) — a pre-planned fallback.

---

## 2. Version map (macro build order)

| Version | Goal | Depends on | Kill / pivot criterion |
|---|---|---|---|
| **V0** | The Judge — incorruptible research engine (ledger, pre-registration, locked vault, walk-forward, cost, multiple-testing gates) | — | n/a (foundation) |
| **V1** | First payload: ORB day-trade strategy run through the Judge | V0 | No ORB variant clears the gate → pivot to V1.5 |
| **V1.5** | Pivot lane (only if V1 fails). *Planned:* session-momentum + index-ORB. *Executed:* ORB fade + session-momentum → validation → **V1.6 Asian-range** (see Executed-history note in §5). Index-ORB = OPEN/UNTESTED, different instrument. | V0 | Neither clears the gate → stop; document dead end |
| **V2** | Refine & stress the surviving direction (robustness, regime, cost sensitivity, parameter stability) | V1 or V1.5 survivor | Survivor doesn't hold out-of-sample → back to V1/V1.5 |
| **V3** | Paper / forward validation on live data (the real holdout) | V2 | Live expectancy ≠ backtest within tolerance → back to V2 |
| **V4** | Autonomous Improvement Engine (scheduled heartbeat around the V0 core) | V3 proven manually | n/a (automation of a proven process) |
| **V5** | Micro-live (0.01 lot) with hard risk limits & kill switch — *optional, future* | V3/V4 | Live drawdown limit breached → halt |

**Why this order:** V0 first because nothing downstream is trustworthy without it.
V1 is the cheapest real test of the chosen direction. Automation (V4) comes *after*
the process works by hand — you only automate what you've proven. Live (V5) only
after forward validation.

---

## 3. V0 — The Judge (incorruptible core)

**Goal:** a harness where any hypothesis is pre-registered, run on train/validation
folds only, judged by fixed statistical gates, and logged — with a locked holdout
the search can never touch.

### Phase V0.1 — Data partition & locked vault
- Steps:
  1. Define the time split on the EUR/USD store (TimescaleDB via
     `ta_engine/loader.py`): TRAIN (oldest ~60%), VALIDATION (~20%), **VAULT**
     (most-recent ~20%) — plus optionally held-out instruments.
  2. Implement a vault guard: any code path that reads VAULT increments a counter
     and requires an explicit `final_confirmation=True` flag. Default access = denied.
- **Gate:** unit test proves normal experiment code cannot read VAULT rows.

### Phase V0.2 — Walk-forward runner interface
- Steps:
  1. Define one interface: `run(hypothesis) -> FoldResults` where a hypothesis =
     `{information source, transform, strategy_fn, instrument set, params, gate}`.
  2. Purged + embargoed walk-forward (no leakage across the trade's own horizon).
  3. Reuse `backtest/scalp_engine.py` for intraday bid/ask fills + session gating.
- **Gate:** a known-negative hypothesis (random entries) returns ~0 expectancy net
  of cost, per fold — proves the runner isn't leaking edge.

### Phase V0.3 — Statistical gates (the Judge)
- Steps:
  1. Per-fold **expectancy net of 1.6-pip spread** (the primary metric, never win
     rate); bootstrap CI on expectancy must exclude 0.
  2. **Beat the fair win rate** — for the variant's reward:risk, compute the random
     rate `stop/(stop+target)` and require the realised rate to exceed the
     cost-adjusted break-even `(stop+cost)/(stop+target)`, per fold.
  3. Fold-consistency (≥75% of folds positive on expectancy).
  4. **Deflated Sharpe** + **multiple-testing correction (Benjamini-Hochberg FDR)**
     keyed to the ledger's experiment count.
  5. Minimum economic effect (expectancy must beat cost with margin, not just > 0).
- **Gate:** feeding 100 random hypotheses yields ≤ expected false-positive rate
  after correction (proves the Judge resists data-dredging).

### Phase V0.4 — Registrar & append-only ledger
- Steps:
  1. Pre-registration: hypothesis + gate written to the ledger *before* the run;
     immutable id. (Formalises today's `EXPERIMENT_LOG.md`.)
  2. Append-only result records: verdict, folds, CI, experiment count at time of run.
- **Gate:** a post-hoc edit of a gate is detectable/rejected.

### V0 REVIEW GATE
- Deliverable: run one dummy strategy end-to-end (register → run → judge → log).
- Proceed to V1 only when the random-hypothesis false-positive test passes.

---

## 4. V1 — ORB day-trade strategy (first payload)

**Goal:** an honest yes/no on whether Opening Range Breakout on EUR/USD, London +
NY sessions, has a cost-surviving intraday edge.

### Phase V1.1 — Opening-range primitive
- Steps:
  1. `opening_range(session_open, minutes)` → range high/low from the first N min
     after 07:00 UTC (London) / 13:00 UTC (NY).
  2. Session-end flat rule (already in `scalp_engine`): no position past close.
- **Gate:** unit tests on synthetic bars (range computed correctly, no look-ahead).

### Phase V1.2 — ORB strategy_fn
- Steps:
  1. Entry: break of range high (long) / low (short), next-bar fill (ask/bid).
  2. Filters (each toggleable, so the Judge can test their marginal value):
     breakout-bar volume ≥ ~150% of 20-bar average; ATR move confirmation; VWAP
     bias anchor. Reuse `market_context` / `ta_engine` detectors where they exist.
  3. Exit: opposite side of range or ATR stop; target = 1–2× range or ATR multiple
     (session-sized, **not** 5 pips); hard flat at session end.
- **Gate:** strategy plugs into the V0 runner interface; smoke test produces trades.

### Phase V1.3 — Pre-registered variant batch
- Steps:
  1. Register ~8–12 variants up front (do **not** fish): {London, NY} × {15, 30 min
     range} × {range-multiple target, ATR target} × {volume filter on/off}.
  2. Run all through the Judge on TRAIN/VALIDATION. Ledger records every one.
- **Gate:** the Judge's multiple-testing correction is applied across the whole batch.

### Phase V1.4 — Vault confirmation
- Steps:
  1. Take only variants that passed validation *after* correction.
  2. Confirm the single best **once** in the VAULT (`final_confirmation=True`).
- **Gate:** positive expectancy net of cost in the vault, beating the fair win rate
  by the §0 margin — per fold. (Win rate itself is never the pass condition.)

### V1 REVIEW GATE — decision branch
- ✅ **A variant clears the vault** → V2 (refine & stress).
- ❌ **Nothing clears** → V1.5 (pivot). Document in the ledger; do **not** re-tune
  ORB knobs hoping for a pass (that's the trap).

---

## 5. V1.5 — Pivot lane (only if V1 fails)

**Goal:** test the next-best intraday hypotheses with the same engine before
concluding no intraday edge exists.

- Phase V1.5a — **Intraday session momentum:** early-session return (e.g. first
  30–60 min) → later-session direction, à la Gao/Han/Zhou; strongest on high-vol /
  news days. Pre-register, run, judge, vault.
- Phase V1.5b — **Index ORB in NY session:** same ORB logic on a liquid equity
  index instrument (where the evidence is strongest), still intraday & flat by
  close. Pre-register, run, judge, vault.
- **REVIEW GATE:** neither clears → **stop**. Write a `NO_INTRADAY_EDGE.md` verdict
  with the evidence. This is a legitimate, valuable outcome.

> ### Executed history (reconciliation — what was actually run)
> The real research path diverged from the plan above and is recorded here and in
> the ledger (`engine/ledger.jsonl`), which is authoritative:
> - **V1 — ORB breakout** (8 variants): **8/8 FAIL**, expectancy ≈ −1.77 to −3.10 pips.
> - **V1.5 — ORB fade + session momentum** (8 variants): **0 PASS, 2 INCONCLUSIVE,
>   6 FAIL**. The two TRAIN leads (`fade_london_15m` +0.964, `mom_london_30m`
>   +0.456) were then tested on the untouched **validation** split
>   (fade −0.439, momentum +0.212) and **did not survive** — both INCONCLUSIVE, so
>   neither became a vault candidate. (This replaced the planned V1.5b index-ORB;
>   fade was added because it was V1's strongest sub-fair signal.)
> - **V1.6 — Asian-range → London** (breakout + fade), added after external ORB
>   research ranked it the best-supported untested FX variant: **2/2 FAIL**
>   (breakout −0.580, fade −2.501).
> - **Conclusion:** `NO_INTRADAY_EDGE.md` — applies to the **tested EUR/USD intraday
>   hypothesis families** only. The **VAULT was never opened** (0 consultations).
>
> **Index-ORB status: OPEN / UNTESTED.** It was never implemented or run. It is a
> **different instrument (equity index)** and is therefore **outside** the EUR/USD
> `NO_INTRADAY_EDGE` conclusion — it is *not* falsified, just not pursued. It
> remains a legitimate fallback hypothesis for a future, separately pre-registered
> experiment.

---

## 6. V2 — Refine & stress the survivor

**Goal:** confirm the surviving edge is robust, not a lucky fold.

- Phase V2.1 — Robustness: other periods, other pairs/instruments, cost-sensitivity
  sweep (spread 1.6 → 2.5 pips), slippage stress.
- Phase V2.2 — Regime conditioning: does the edge live only in high-vol / news /
  trending days? Condition on `atr_regime`, calendar events (`data/fetch_calendar`).
- Phase V2.3 — Parameter-stability map: is the edge a plateau (robust) or a spike
  (overfit)? Reject spikes.
- Phase V2.4 — Risk sizing: position sizing, per-trade risk %, daily loss limit.
- **REVIEW GATE:** edge holds across periods/instruments and sits on a plateau →
  V3. Otherwise → back to V1/V1.5.

---

## 7. V3 — Paper / forward validation (the real holdout)

**Goal:** prove backtest expectancy reproduces on unseen, live-arriving data.

- Phase V3.1 — Live intraday data feed (OANDA), session scheduler.
- Phase V3.2 — Paper execution: simulate fills with realistic slippage; log every
  intended vs filled price.
- Phase V3.3 — Forward run for a pre-set window (e.g. 8–12 weeks); compare live
  expectancy vs backtest within a tolerance band.
- **REVIEW GATE:** live matches backtest within tolerance → V4/V5. Divergence →
  diagnose (cost model? regime shift?) → back to V2.

---

## 8. V4 — Autonomous Improvement Engine (heartbeat)

**Goal:** automate the proven manual loop — the Brain proposes the next generation
on a schedule; the Body (V0) judges it.

- Phase V4.1 — Proposer service: reads ledger + prior results + repo, emits the next
  pre-registered hypothesis spec (and synthesises its code). Human-approve first,
  loosen as trust builds.
- Phase V4.2 — Scheduler/heartbeat (scheduled-tasks): one cycle = propose → run →
  judge → log. Budget caps (max experiments/generation) so it can't brute-force.
- Phase V4.3 — Dashboard: ledger view, vault-consultation counter, equity of live
  survivors.
- **REVIEW GATE:** engine reproduces manual verdicts on known cases before it runs
  unsupervised.

> **Why last:** you only automate a process after it works by hand. Automating an
> unproven process just produces false positives faster.

---

## 9. V5 — Micro-live (optional, future)

- 0.01-lot live with hard daily-loss and max-drawdown kill switches, monitoring,
  and a manual halt. Only after V3 forward validation passes. Live drawdown limit
  breached → halt and review.

---

## 10. Cross-cutting (every version)

- **Risk management:** per-trade risk %, daily loss limit, session exposure cap.
- **Reproducibility:** every result re-runnable from a ledger id + a command.
- **Documentation:** each version closes with a findings doc (like `SCALP_FINDINGS`).
- **Cost realism:** the 1.6-pip spread (and its rollover spikes) is the default;
  re-measure with `research/spread_profile.py` if the broker/feed changes.

---

## 11. What already exists (reuse, don't rebuild)

- `backtest/scalp_engine.py` — intraday bid/ask fills, session/spread/time gates,
  0.01-lot P&L. Basis for the V1 ORB runner.
- `ta_engine/loader.py` — multi-timeframe candle loading (native M1/M5/M15/M30/H1).
- `market_context/` — ICT detectors (structure, FVG, liquidity, premium/discount,
  displacement) for ORB filters and the V1.5 momentum/liquidity variants.
- `research/` — `spread_profile`, `scalp_validate`, `edge_level_to_level`,
  `walkforward_eurusd` (patterns the V0 runner/Judge generalise).
- `data/` — OANDA ingestion (incl. real M1 bid/ask via `004_bidask.sql`), calendar.
- `EXPERIMENT_LOG.md` — the informal ledger V0.4 formalises.

---

## 12. Immediate next step

Build **V0.1–V0.4 (the Judge)** and, in parallel, spec the **V1.3 pre-registered
ORB batch** so the first real experiment is ready the moment the Judge is live.
```
# V0 smoke path (target):
#   register(hypothesis) -> run(train/valid) -> judge() -> ledger.append()
#   confirm(best, final_confirmation=True) -> vault verdict
```
