# Spekrym-FX — System Dossier (complete handoff)

Single self-contained description of the whole system: architecture, every
component, every experiment and verdict, the data pipeline, how to reproduce, and
the current decision point. Supersedes the older `SYSTEM_STRATEGY_AND_EDGE.md`
(which predates the research engine). Written for another researcher/AI to fully
understand the project without the chat history.

---

## 0. One-paragraph status

The project set out to find a profitable **intraday EUR/USD day-trading edge**.
To avoid fooling ourselves, we first built an **incorruptible research engine**
(the "Judge") and only then tested strategies through it. Across every intraday
hypothesis — ORB breakout, opening-range fade, session momentum, Asian-range →
London — **no durable, cost-surviving directional edge was found.** A read-only
forensic autopsy showed the failure is a **signal** failure (breakout direction
carries almost no information), not an exit/location/cost problem. The **VAULT
(final holdout) was never opened.** Current decision: pivot to *different
information* or pause. The engine itself is production-quality and reusable.

**Bottom line:** the tested EUR/USD intraday hypothesis families (all single-pair,
price-derived) have failed to demonstrate a durable, cost-surviving edge under the
pre-registered framework; the ORB forensic autopsy shows the dominant failure is
signal/direction, not exits. This is backed by our own adversarial testing *and*
independent external research. **Scope:** this is not a proof that *every*
conceivable intraday signal has zero information — it is a falsification of the
specific families tested. **Index-ORB (a different, equity-index instrument)
remains UNTESTED and OPEN — it is NOT covered by this EUR/USD conclusion.**

---

## 1. First principles (the research philosophy)

1. **Referee before players** — the deterministic Judge was built before any
   strategy was tuned.
2. **Falsification-first** — every experiment is pre-registered with its pass/fail
   gate *before* running; we try to break ideas.
3. **Net of real cost always** — measured EUR/USD spread = **1.6 pips** median
   (London/NY). In-sample or zero-cost results are rejected.
4. **The information is the edge, not the module** — a better strategy can't
   recover predictive content that isn't in the data.
5. **Multiple testing is the enemy** — trying many variants and keeping the best
   manufactures false positives; the Judge corrects for the number of experiments.
6. **Kill criteria are pre-committed** — each phase has a condition to stop/pivot.
7. **Expectancy is the target, never win rate** — >50% win rate can still lose.

---

## 2. Architecture

```
OANDA v3 (M1 bid/ask, "MBA")
      │  data/fetch_ohlcv.py
      ▼
TimescaleDB (Docker, candles table w/ bid/ask cols — migration 004_bidask)
      │  ta_engine/loader.py  (load_candles: native M1/M5/M15/M30/H1; H4/D1 resampled)
      ▼
engine/datacache.py  (pickle cache; verify_equiv proves cache == DB exactly)
      │
      ▼
engine/partition.py  ──  TRAIN 60% / VALID 20% / VAULT 20% (chronological)
      │                   VAULT locked: load_vault(final_confirmation=True) only,
      │                   every read counted+logged to vault_access.json
      ▼
engine/runner.py  run(Hypothesis, df) → RunResult
      │  executes strategy on backtest/scalp_engine.py (bid/ask fills, spread,
      │  slippage, session gates), buckets trades into N chronological folds
      ▼
engine/judge.py  judge_batch(results, GateConfig) → [Verdict]  PASS/FAIL/INCONCLUSIVE
      │  expectancy (primary) + bootstrap p + fold-consistency + min-trades,
      │  Benjamini-Hochberg FDR across the batch; fair-win-rate = DIAGNOSTIC only
      ▼
engine/ledger.py  append-only; pre-registration (sha256 of spec+gate);
                  post-hoc gate edits rejected; freeze_spec binds code/data/cost
```

### 2.1 The research engine (`engine/`) — "the Judge", V0 + V0.5 hardening

| File | Role | Key API |
|---|---|---|
| `partition.py` | chronological split + locked vault | `SPLITS={train:(0,.6),valid:(.6,.8),vault:(.8,1)}`, `load_split`, `load_vault(final_confirmation=True)`, `vault_consultations()` |
| `runner.py` | walk-forward runner | `Hypothesis(name, strategy_fn, pair, engine_kwargs, n_folds)`, `run()→RunResult(net_pips, folds, trades)` |
| `judge.py` | fixed statistical gates | `GateConfig(stop_pips, target_pips, cost_pips=1.6, min_trades=30, min_fold_pos=0.75, fdr_alpha=0.05)`, `judge_batch()→Verdict(status∈{PASS,FAIL,INCONCLUSIVE})` |
| `ledger.py` | pre-registration + append-only log | `register(spec)→id`, `record_result(id, spec, verdict)`, `freeze_spec(code_commit, data_snapshot, cost_model_version)` |
| `datacache.py` | pickle cache of candle frames | `load_split_cached()`, `verify_equiv()` |

**Judge verdict logic (`_status`):** `enough_trades(n≥30)` + `expectancy>0` +
`significant(FDR)` + `fold_pos≥0.75` → **PASS**; `n≥30` and `expectancy≤0` →
**FAIL** (evidence against an edge); otherwise (too few trades, or positive but
noisy/inconsistent) → **INCONCLUSIVE**. FAIL ≠ INCONCLUSIVE — a key distinction.

**Profitability bar (how gates read economically):** with a stop `S`, target `T`,
cost `c`, a random entry wins ≈ `S/(S+T)` (the *fair* rate) and break-even is
`(S+c)/(S+T)`. At 1.5:1 reward:risk the fair rate is 40% and break-even ~44% — so
a ~40% win rate can be very profitable, and the gate asks us to beat the fair rate
by enough to clear cost, *measured as expectancy*, not win rate.

### 2.2 The backtest engine (`backtest/scalp_engine.py`)

`run_scalp_backtest(m1, strategy_fn, pair, tp_pips, sl_pips, lot=0.01, sessions,
max_hold_min, max_spread_pips, slippage_pips=0.0, htf_provider)`.
- **Realistic fills:** long buys `ask_open` (+slippage), exits on `bid`; short
  sells `bid_open` (−slippage), exits on `ask`. The spread is paid in the fill —
  **not** subtracted separately (so the 1.6-pip cost is a *diagnostic* reference,
  never double-counted).
- SL checked **before** TP on the same bar (pessimistic); 45-min default time
  stop; **flat at session end**. `ScalpTrade` records entry/exit, net_pips, R,
  exit_reason, spread_at_entry.

### 2.3 Strategies (`market_context/`)

- `orb_strategy.py` — `opening_range()` (causal high/low of first N min after a
  session open, no look-ahead) + `make_orb_strategy(cfg)`. Signal: break of range
  high→long / low→short; `mode:"fade"` flips it; `sl_pips=range width`,
  `tp_pips=target_mult×range`. Config: session_open, range_min, entry_window_min
  (180), target_mult (1.5), min/max_stop_pips, use_volume, use_vwap, max_tail.
- `momentum_strategy.py` — `make_session_momentum_strategy(cfg)`: sign of the
  first `signal_min` minutes' return → trade direction, wide stops → session-close
  exit. Tests early-session → rest-of-session momentum.
- Detectors available but (deliberately) **not yet wired into entries**:
  `structure.py` (BOS/CHoCH/trend), `liquidity.py` (BSL/SSL, swept), `imbalance.py`
  (FVG/iFVG), `displacement.py`, `premium_discount.py`, `levels.py` (PDH/PDL/PWH/
  PWL/prior-session), `support_resistance.py`, `context.py` (MTF).

---

## 3. Experiments and verdicts (all via the locked Judge, net of cost)

| Phase | Hypothesis family | Variants | Verdict |
|---|---|---|---|
| V1 | ORB **breakout** (London/NY × 15/30-min × volume on/off) | 8 | **8/8 FAIL** — expectancy −1.77 to −3.10 pips; win 28–34% (below 40% fair) |
| V1.5 | ORB **fade** + session **momentum** (London/NY) | 8 | **0 PASS, 2 INCONCLUSIVE, 6 FAIL** |
| — | validation of the 2 leads (untouched VALID split) | 2 | **did not confirm** — fade +0.96→−0.44 (short side reversed); momentum long/short inverted |
| V1.6 | **Asian-range → London** breakout + fade | 2 | **2/2 FAIL** — breakout −0.58 (p=0.63), fade −2.50 |

**18 experiments logged** in `engine/ledger.jsonl`. **VAULT never opened.**

### 3.1 The two leads and why they died (the system working)
`fade_london_15m` looked best on TRAIN: **+0.96 pips**, both directions positive,
3/4 folds. The hardened Judge marked it **INCONCLUSIVE** (not PASS). Diagnostics
showed it was thin and right-tail-dependent (expectancy → +0.035 after removing
the top 5 of 149 trades). On the untouched **VALIDATION** split it flipped to
**−0.44** and its dominant short side reversed sign — classic overfitting. The
system *discovered something interesting and refused to believe it.*

### 3.2 ORB Forensics V1 (read-only autopsy; `research/orb_forensics.py`)
Reconstructed **1,186** ORB breakout trades on TRAIN and measured MFE/MAE in R:

- **MFE_R median = 0.48** (median trade's best favorable move < half the risk).
- **Loss anatomy (814 losers):** BAD_DIRECTION (MFE<0.25R) **52.9%**, STALLED
  (0.25–1.0R) 37.5%, EXIT_PROBLEM (≥1R then lost) **9.6%**, COST_DOMINATED 0.6%.
- **First-break audit:** the ORB re-signalled (2.83 entries/session, max 8; 83% of
  sessions >1 entry), but taking **first-break only is *worse*** (−3.67 vs −3.10)
  — the multi-entry quirk wasn't hiding an edge.
- **Conclusion:** ~90% of losses are the direction being wrong/weak, not a good
  move given back by bad exits. **This is a SIGNAL failure.** Better exits,
  targets, or location cannot rescue a direction that carries no information, so
  "ORB 2.0" is *not* justified by the evidence.

### 3.3 Earlier (pre-engine) results, consistent with the above
Scalping was falsified earlier: 1-minute EUR/USD, 5-pip targets vs 1.6-pip spread,
**MFE p50 ≈ 0.5 pips** (see `SCALP_FINDINGS.md`). Also an ML forecast audit, ICT
confluence tests, and a level-to-level test (hit rate ≈ fair rate) — all negative.
The ORB forensic MFE_R median of 0.48 is the same story at the day-trade horizon.

---

## 4. Data pipeline

- **Source:** OANDA v3 REST, M1 candles with mid + **bid/ask** (`price="MBA"`),
  via `data/fetch_ohlcv.py`. Economic calendar via `data/fetch_calendar.py`.
- **Store:** TimescaleDB in Docker (hypertable `candles`, columns `ts,o,h,l,c,v,
  bid_o/h/l/c,ask_o/h/l/c,pair,tf,complete`). Migration `data/migrations/004_bidask.sql`
  added the bid/ask columns. Container must be running (Docker Desktop).
- **Volume:** ~740k M1 bars available; experiments used the most-recent 200k
  (TRAIN = oldest 120k, VALID = 40k, VAULT = 40k, all cached to pickle).
- **Measured cost:** `research/spread_profile.py` → EUR/USD spread **1.6 pips**
  median in London/NY (p90 1.7; ~21:00 rollover spikes to 2.7–6).

---

## 5. Reproduce

```
# prerequisites: Docker running (TimescaleDB), ./venv active
python -m research.spread_profile EUR_USD        # measured spread ≈ 1.6 pips
python -m backtest.run_orb_batch                 # ORB breakout → 8/8 FAIL
python -m backtest.run_v15_batch                 # fade + momentum → 2 INCONCLUSIVE, 6 FAIL
python -m research.run_validation_leads          # the 2 leads flip negative OOS
python -m backtest.run_asian_batch               # Asian-range → London → 2/2 FAIL
python -m research.orb_forensics                 # autopsy → signal failure (MFE_R p50 0.48)
python -m pytest engine/ -q                      # 24 engine tests (incl. golden/adversarial)
```

Ledger: `engine/ledger.jsonl`. Cache: `engine/cache/EUR_USD_M1_200000.pkl`.
Vault access log: `engine/vault_access.json` (should show **0 consultations**).

---

## 6. Test suite (the engine is real infrastructure)

- `engine/tests/` — **24 tests**: partition/vault (5), runner/no-edge-leak (3),
  judge/FDR (2), ledger/tamper (5), end-to-end (1), **adversarial (4)**
  (no-future-leak, bid/ask-not-mid, slippage bites, insufficient→INCONCLUSIVE,
  frozen-spec binds), **golden (4)** (hand-calculated P&L: TP=+10, SL=−5,
  session-exit=−spread, session-exit+slippage). Plus `test_datacache.py` (cache==DB).
- `market_context/tests/` — ORB strategy (5), V1.5 strategies (2), plus the
  pre-existing detector tests. Full project suite was green (181 passed) before the
  engine work, plus the new engine/strategy tests.

Golden + adversarial tests mean any future change to `scalp_engine`, the runner,
the cost model, or the Judge must still reproduce known numbers and resist
false positives.

---

## 7. Independent external corroboration

A professional ORB research review (sources below) reached the same conclusion
from the literature: quantifiedstrategies' London-breakout EUR/USD tests "mixed
and losing"; an SSRN study found "four opening-range breakout combinations lost
money out-of-sample and on holdout"; its bottom line — *"there is no public basis
to quote a defensible forex ORB win rate."* Its #1 candidate (Asian-range →
London) is exactly the variant we tested and that FAILED. Our results and the
external evidence agree at every point. (`NO_INTRADAY_EDGE.md` documents this.)

---

## 8. Known limitations / honest caveats

- The ORB signal is intentionally bare (break of range → next-bar fill). It does
  **not** use the available SMC/structure/liquidity/levels modules for entries.
  The forensics shows this is not why it failed (the *direction* lacks info), so
  wiring those in is not justified — but it is a true description of scope.
- The 1.6-pip cost is a reference for the break-even diagnostic; actual P&L uses
  per-bar bid/ask, so cost realism depends on bid/ask data completeness.
- A performance note: the per-bar strategy re-parses timestamps, so large batches
  take minutes (a precompute fix is pending).
- Ledger audit note: the 8 original ORB-breakout result records predate the
  runners standardising on a `status` field, so they carry `passed:false` +
  negative expectancy but no `status` string (status is unambiguously FAIL). The
  ledger is **append-only by design**, so these historical records are preserved
  as-is rather than rewritten; `run_orb_batch.py` was updated so future records
  carry `status`.
- Index-ORB (equity-index instrument) is listed in the roadmap as a fallback but
  was never implemented or run; it is OPEN/UNTESTED and outside the EUR/USD
  `NO_INTRADAY_EDGE` conclusion.

---

## 9. Current decision point

The intraday EUR/USD question is answered rigorously and is mechanism-backed.
Options:
1. **Pivot to different information** (highest EV): cross-sectional carry/momentum
   across many pairs, relative-value / cointegration, or non-price data (rates,
   positioning, crypto funding/basis). The engine, cost model, Judge, ledger and
   cache are all reusable; only a new strategy + data loader are needed.
2. **Pause** — the question is closed honestly.

The VAULT remains sealed for whatever genuinely new, pre-registered hypothesis
comes next.

---

## 10. File map (what matters)

```
engine/            partition.py runner.py judge.py ledger.py datacache.py  (+tests/)
backtest/          scalp_engine.py  run_orb_batch.py run_v15_batch.py run_asian_batch.py
market_context/    orb_strategy.py momentum_strategy.py  + SMC detectors  (+tests/)
research/          spread_profile.py run_validation_leads.py orb_forensics.py
ta_engine/         loader.py smc.py price_action.py indicators.py support_resistance.py
data/              fetch_ohlcv.py fetch_calendar.py db.py migrate.py migrations/
docs (root)        DEVELOPMENT_ROADMAP.md NO_INTRADAY_EDGE.md SCALP_FINDINGS.md
                   HANDOFF_FOR_REVIEW.md SYSTEM_DOSSIER.md (this file)
```

Sources (external review): forex.com ORB education; quantifiedstrategies.com/
london-breakout-strategies; papers.ssrn.com abstract_id=7308022 and 7435081.
