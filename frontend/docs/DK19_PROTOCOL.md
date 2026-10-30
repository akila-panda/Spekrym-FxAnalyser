# DK19 — Level scorecard PROTOCOL (written before the code)

Status: **Exploratory · descriptive only · sample data.** Never auto-tunes the methodology; no probability or forecast language.
Gate G3 (methodology freeze) is owed by the owner; until then every result is stamped with the active `rulesVersion` and is invalid for any other version.

## Question
How often do the objects the methodology detects show a given **observable follow-up**, in the (sample) history? Geometry is observable; edge is empirical and is **not claimed**.

## Universe
Pairs: the 5 majors. TFs: D, H4, H1, M15, M5 (deep sample). Objects: `fvg`, `sd_zone`, `sweep` from the full-history detection (all closed bars, `asOf = latest`), methodology = the active config.

## Observations (one row per object per metric)
All outcomes read **only bars after the fact's `known_at`** and only inside a fixed window that must be **fully observable** (right-censoring: objects whose window runs past the data end are excluded, never counted as failures).
- **H1 `fvgFill`** — FVG: a `filled` lifecycle fact within **100 bars** of its TF after `known_at`.
- **H2 `reaction`** — FVG/S-D: after the first entry fact (`partially_filled` / `partially_mitigated`), within `levels.reactBars` bars price departs the zone's near edge by ≥ `levels.reactAtr`×ATR (ATR at the entry bar), in the zone's direction, with no close beyond the far edge first.
- **H3 `sweepOpposite` / `sweepSame`** — sweep: within `liquidity.followBars` bars after the sweep bar, a kernel displacement **starts** in the direction opposite to the swept side / the same side. The two are independent facts (both, either or neither can occur).
- **H4 nested vs single** — H2 split by cohort: *nested* = the object sits inside a higher-TF object (`nested` relation known at or before the entry); *single* = otherwise.

## Reporting
Counts `k/n` per group (type · pair · session · TF · cohort). Share = k/n with a **Wilson 95 % interval**. **Small-sample suppression:** n < 20 shows counts only, no share/interval. Sessions use the OQ-7 *approx* definitions (DST-aware); `overlap` = more than one open, `off` = none.

## Guardrails
- Multiple groupings are displayed; differences between rows are **not** tuning signals (multiple comparisons, one mock history).
- No row, button or code path writes to the methodology store.
- Changing a window/threshold here requires revising this protocol first.
- Causality test: observations computed on a prefix must equal the same observations on the full history wherever the window fits inside the prefix.