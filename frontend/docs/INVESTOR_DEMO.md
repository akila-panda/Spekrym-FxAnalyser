Investor walkthrough
Updated 28 October 2026. Frontend simulation only; no live broker, model execution or research mutations.
Open
Run npm run dev in frontend/. Enable the floating Demo toggle, then click Investor walkthrough above it. The URL is ?window=demo&demo=1.

The walkthrough has nine chapters: Scan, Prepare, Intelligence, Plan, Monitor, Review, Portfolio, Research and Ops. These chapters share one in-memory session. Standalone feature gallery opens the earlier feature screens; those screens retain their independent fixtures and do not share this session. Leaving or reloading the walkthrough clears its state.
Presentation script
1. Choose A setup develops. Start in Scan: compare five pairs at the same timestamp. Select EUR/USD, then Prepare.
2. Advance to +30m. Click support, sweep, recovery, trigger and invalidation cards to locate their geometry. Switch H1 → Drill latest parent → M15; Back to parent restores the preceding timeframe.
3. Open Intelligence. The first synthetic forecast has been issued. Conditional paths have no probability. The context panel distinguishes the M1 observation from missing higher-timeframe confirmation.
4. Advance to +50m. Guided mode has frozen the EUR/USD plan at +35m and submitted its paper condition and alert at +45m. Inspect the cost-aware sizing in Plan and the fill/alert events in Monitor.
5. Advance to +70m. Compare the revised forecast with its preserved original. Inspect Portfolio to see the same open position and currency exposure.
6. Advance to +120m. Review the simulated target exit and its frozen evidence. Click Inspect frozen decision: later fills and outcomes disappear. Return to the session clock.
7. Choose Conditions change. At +50m the scheduled news blackout has rejected the order. At +70m the feed is stale: current prediction is withheld. At +120m Review shows no executed trade, and the subsequent price movement is explicitly hypothetical.
8. Choose Every decision can be reviewed. At +120m the same planned process produces a stop exit. Review separates evidence, decision, process and outcome.
9. In Research, inspect the proposal → recorded human authorization → registered experiment → validation report → FAIL sequence. The sample does not promote a failed strategy. Ops identifies simulated, interactive and disconnected capabilities.
Manual exploration
- Disable Guided sample decisions before +35m to create your own plan.
- Accept evidence in Prepare. In Plan, edit entry, stop, target, risk %, spread and slippage. Chart handles support pointer drag and ArrowUp/ArrowDown in one-pip increments.
- Freeze the plan, then submit its paper condition. The subsequent M1 bars determine fills; submission cannot fill on the current bar. A frozen plan cannot be edited. Reset for a different attempt.
- Arm a close-above-trigger alert in Monitor. An alert can fire while execution is blocked: condition detection and execution permission are separate.
- Select a second pair to preview combined exposure. Sample limits are checked on submission and again at fill: 1% combined open risk and $40,000 equivalent net exposure per currency.
- In Ops, inject news, stale-feed or exposure conditions. Clearing an injection does not override a scheduled condition or revive a rejected order.
- Simplify retains invalidation, scheduled risk windows, current blocking messages and execution evidence. Selecting an evidence card can retain that selected object for inspection.
- The history slider only visits already-recorded minutes. Inspection pauses playback and disables mutations. Return to session clock resumes editing eligibility; Play resumes from the current session clock.
- Export visible session downloads JSON containing only plans/events knowable at the inspected time. Reset story clears this walkthrough, not production preferences or stored decisions.
Data and execution boundaries
- One deterministic M1 tape per pair/story; W/D/H4/H1/M15/M5/M1 aggregate those exact children. Higher-timeframe final candles may be forming, explicitly labelled, and contain no future children.
- The tape includes 21 days of synthetic context and a 120-minute story. It is a continuous illustrative UTC calendar, including weekends. D/W use the application's fixed anchors, not a broker/DST calendar.
- The five-pair comparison ranks observed percentage changes, not trade quality. Currency strength is a mean signed return over this limited basket with unequal currency coverage. Exposure is a simplified net-notional proxy, not a correlation model.
- Paper simulation is long-only, one frozen plan per pair per story, on a fixed USD 10,000 account. Costs include round-trip spread and slippage on both sides; financing and commissions are excluded. USD/JPY and USD/CAD use sample pair prices for USD conversion.
- Gap risk is checked against the frozen budget. Stop wins when a bar touches both stop and target, including entry bars. Stops retain gap/slippage risk. Pending orders expire at session end; open positions close then. Feed degradation blocks new entries and current predictions; simulated protective stops remain active on the synthetic tape.
- Forecast intervals are illustrative projections from already-known sample closes. There is no measured calibration, probability, accuracy or profitability claim. The original record is preserved, revisions are causal, and issuance is withheld if the sample feed was stale at that issue time. Horizon observations appear only after the horizon.
- Forecast edges and fill use existing chart primitives rather than native indicator series, preventing extra minute-level forecast points from changing higher-timeframe candle spacing.
- Research authorizations, jobs, reports and verdicts are scripted records. The UI does not grant authority, start experiments, read the holdout, learn a strategy, promote a model or trade live. Synthetic research numbers are not real system results.
State and validation
All walkthrough state lives in a React reducer. Session clock, drafts, frozen plans, decisions, alerts and event history are window-local and ephemeral; chart timeframe/focus are view-local. No replicated store, BroadcastChannel binding, production persistence or backend interface is added.

Validation: TypeScript, full Vitest suite and Vite production build. New tests cover parent aggregation, supported price scales, three story outcomes, costs, order timing, exposure gates, replay/export causality, reset isolation, forecast revision/withholding, primitive projection edges, research timing and UI wiring. Browser checks cover chart drag, timeframe drill/back, story outcomes, replay, stale-feed withholding, USD/JPY, playback, small-screen overflow and demo-off behavior. The existing Vite large-bundle advisory remains.