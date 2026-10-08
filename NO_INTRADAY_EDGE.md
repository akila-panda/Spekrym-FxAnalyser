# NO_INTRADAY_EDGE.md

Pre-committed verdict for the intraday EUR/USD day-trading program (roadmap V1 →
V1.6). Every intraday session-direction hypothesis we could motivate was tested
through the same hardened, incorruptible Judge, net of real bid/ask cost. **None
produced a durable edge.** The VAULT was never opened — the final holdout is
still sealed and uncontaminated.

## VERDICT: NO DURABLE INTRADAY EDGE (EUR/USD)

## What was tested (all via engine V0.5, cost-real, FDR-corrected)

| Family | Variants | Result |
|---|---|---|
| ORB **breakout** — London/NY first 15/30-min range | 8 | **8/8 FAIL** (expectancy −1.77 to −3.10 pips; win 28–34%, below the 40% fair rate) |
| ORB **fade** + session **momentum** — London | 2 | **INCONCLUSIVE on train, did NOT confirm on validation** |
| **Asian-range → London** breakout + fade (00:00–07:00 → 07:00–12:00 UTC) | 2 | **2/2 FAIL** (breakout −0.58 pips p=0.63; fade −2.50) |

18 experiments logged in `engine/ledger.jsonl`. Reproduce:
```
python -m backtest.run_orb_batch        # London/NY breakout → 8/8 FAIL
python -m backtest.run_v15_batch        # fade + momentum → 2 INCONCLUSIVE, 6 FAIL
python -m research.run_validation_leads # the 2 leads flip negative out-of-sample
python -m backtest.run_asian_batch      # Asian-range → London → 2/2 FAIL
```

## The decisive moment (why this is trustworthy, not just negative)

The two London leads (`fade_london_15m` +0.96 pips, `mom_london_30m` +0.46)
looked promising on TRAIN — coherent structure, both directions positive, 3/4
folds. The system did **not** believe them:
- the hardened Judge marked them **INCONCLUSIVE**, never PASS;
- diagnostics showed the fade's edge was thin and right-tail-dependent (died on
  removing the top 5 of 149 trades);
- the **untouched validation split killed them**: fade expectancy flipped
  **+0.96 → −0.44**, its dominant short side reversed sign (+1.26 → −2.03), and
  momentum's long/short structure inverted. Classic overfitting signatures.

This is the architecture working: *the system discovered something interesting
and refused to fool itself into believing it.*

## Independent external corroboration

A professional ORB research review (Perplexity synthesis, sources below) reached
the same conclusion from the literature:
- quantifiedstrategies' London-breakout EUR/USD tests were "mixed and losing";
- an SSRN study found "four opening-range breakout combinations lost money
  out-of-sample and on holdout, with win rates below breakeven";
- its own bottom line: *"there is no public basis to quote a defensible forex ORB
  win rate"* — all retail ORB performance claims are marketing, not validation.
- Its #1 ranked candidate — Asian-range → London — is exactly the variant we then
  tested and that FAILED here.

Our results and the external evidence agree at every point.

## What this means

Across **seven+ independent adversarial tests** spanning H1/M5/M1 scalping, ML
forecasting, ICT confluence, level-to-level, ORB breakout, fade, momentum, and
Asian-range, the finding is consistent: **the tested EUR/USD intraday hypothesis
families have failed to demonstrate a durable, cost-surviving edge under the
pre-registered research framework.** Their common denominator is single-pair
EUR/USD *price-derived* information. The next move is **different information, not
more transformations of the same candles** — see below.

**Scope limit (what this does NOT claim):** this does not prove that *every*
conceivable structure-conditioned opening-range or intraday signal has zero
predictive information. It establishes that the specific pre-registered families
above did not clear the gate, and (per the forensics) that ORB's dominant failure
mechanism is signal/direction, not exit management.

## Forensic autopsy of the ORB failure (research/orb_forensics.py)

**OBSERVED** (1,186 reconstructed ORB breakout trades, TRAIN):
- MFE_R median = 0.48
- losers (814): BAD_DIRECTION 52.9% · STALLED 37.5% · EXIT_PROBLEM 9.6% · COST_DOMINATED 0.6%
- first-break-only is *worse* than all-entries (−3.67 vs −3.10) — the repeated-signal
  quirk was not hiding an edge.

**INTERPRETATION:** in the tested ORB breakout specification the dominant failure
mechanism is weak/incorrect direction, not exit management or repeated-entry
contamination.

**DECISION:** do not pursue ORB exit optimization or "ORB 2.0" at this stage;
close this hypothesis family and preserve the result.

Per roadmap principle 4 ("the information is the edge, not the module"), the next
move is **different information, not more intraday variants or filters** — which
would only be industrial-scale curve-fitting against a referee built to prevent
exactly that.

## Honest options from here

1. **Pivot to different information** (highest EV): cross-sectional carry/momentum
   across many pairs, relative-value / cointegration, or non-price data (rates,
   positioning, crypto funding/basis). Separate projects with their own (low but
   non-zero) documented base rates. The V0 research engine, cost model, Judge,
   ledger and cache are all reusable for these.
2. **Pause** — the intraday EUR/USD question is answered rigorously and honestly.

## Preserved assets (reusable regardless)

`engine/` (locked vault, walk-forward runner, hardened Judge, append-only ledger,
cache), `backtest/scalp_engine.py` (bid/ask fills + slippage), the market-context
detectors, and the full test suite (engine golden/adversarial + strategy tests).
The VAULT remains sealed for whatever genuinely new hypothesis comes next.

---
Sources (external review): forex.com ORB education; quantifiedstrategies.com/
london-breakout-strategies; papers.ssrn.com abstract_id=7308022 (Asian→London
pre-validation) and 7435081 (ORB combinations lost OOS).
