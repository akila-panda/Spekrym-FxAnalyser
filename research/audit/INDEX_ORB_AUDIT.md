# NAS100 index-ORB — TRAIN audit (read-only, vault sealed)

Source: cached NAS100_USD M1 TRAIN, 180000 bars. P/L in points after real bid/ask spread. $1/point. Per-trade CSVs in research/audit/.

## TASK 2 — Summary (recomputed)

| variant                |   trades |   wins |   losses |   win_pct |   avg_win |   avg_loss |   expectancy |   total_pts |        total_usd |   profit_factor |   max_dd_pts |   longest_loss_streak |   best |   worst |   long_total |   short_total |
|:-----------------------|---------:|-------:|---------:|----------:|----------:|-----------:|-------------:|------------:|-----------------:|----------------:|-------------:|----------------------:|-------:|--------:|-------------:|--------------:|
| idx_breakout_15        |       98 |     43 |       55 |     0.439 |    108.82 |     -76.86 |         4.61 |       451.6 |  451600          |            1.11 |        591.3 |                     4 |  180   |  -111.4 |        851.1 |        -399.4 |
| idx_breakout_15_retest |       95 |     45 |       50 |     0.474 |    110.19 |     -73.5  |        13.51 |      1283.8 |       1.2838e+06 |            1.35 |        510.6 |                     4 |  180   |  -119.3 |       1133.6 |         150.2 |
| idx_breakout_15_relvol |        5 |      2 |        3 |     0.4   |     83.05 |     -47.27 |         4.86 |        24.3 |   24300          |            1.17 |        111   |                     2 |   93.3 |   -76.2 |         55.1 |         -30.8 |
| idx_fade_15            |       80 |     33 |       47 |     0.412 |     97.16 |     -77.2  |        -5.27 |      -422   | -421950          |            0.88 |       1420.2 |                     4 |  161.6 |  -120   |         -9   |        -412.9 |
| idx_breakout_30        |       39 |     19 |       20 |     0.487 |     66.9  |     -78.11 |        -7.46 |      -291   | -290950          |            0.81 |        669.2 |                     4 |  176.6 |  -117.8 |        134   |        -424.9 |
| idx_fade_30            |       33 |     13 |       20 |     0.394 |     79.11 |     -83.08 |       -19.19 |      -633.3 | -633300          |            0.62 |        607.9 |                     5 |  167.1 |  -117.7 |       -274.8 |        -358.5 |


## TASK 1 — sample (first 5 trades of breakout_15_retest; full in CSV)

| variant                |   trade | date       | weekday   | direction   | entry_et   |   entry |    stop |   target | exit_et   |    exit | exit_reason   |   hold_min |   range_pts |   gross_pts |   spread_pts |   net_pts |   net_usd |     R |   cum_net | result   |
|:-----------------------|--------:|:-----------|:----------|:------------|:-----------|--------:|--------:|---------:|:----------|--------:|:--------------|-----------:|------------:|------------:|-------------:|----------:|----------:|------:|----------:|:---------|
| idx_breakout_15_retest |       1 | 2025-11-26 | Wed       | short       | 10:00      | 25115.6 | 25196.5 |  24994.2 | 10:39     | 25196.5 | sl            |         39 |        80.9 |      -79.8  |          1.1 |    -80.9  |    -80900 | -1    |    -80.9  | L        |
| idx_breakout_15_retest |       2 | 2025-11-26 | Wed       | long        | 11:01      | 25224.5 | 25143.6 |  25345.9 | 14:01     | 25284.6 | time          |        180 |        80.9 |       60.9  |          0.8 |     60.1  |     60100 |  0.74 |    -20.8  | W        |
| idx_breakout_15_retest |       3 | 2025-11-28 | Fri       | long        | 11:07      | 25379.2 | 25289.6 |  25513.6 | 18:00     | 25467.6 | time          |       3293 |        89.6 |       89.2  |          0.8 |     88.4  |     88400 |  0.99 |     67.6  | W        |
| idx_breakout_15_retest |       4 | 2025-12-01 | Mon       | long        | 09:51      | 25277.4 | 25166.7 |  25443.5 | 12:44     | 25443.5 | tp            |        173 |       110.7 |      167.15 |          1.1 |    166.05 |    166050 |  1.5  |    233.65 | W        |
| idx_breakout_15_retest |       5 | 2025-12-03 | Wed       | long        | 10:18      | 25508.6 | 25424.1 |  25635.4 | 13:18     | 25591.8 | time          |        180 |        84.5 |       84    |          0.8 |     83.2  |     83200 |  0.98 |    316.85 | W        |


## TASK 3 — Breakdowns (breakout_15 & retest; full data in CSVs)

### idx_breakout_15
by month:
| month   |   count |    sum |
|:--------|--------:|-------:|
| 2025-11 |       4 |  -13.3 |
| 2025-12 |      19 | -196.6 |
| 2026-01 |      13 |  590.4 |
| 2026-02 |       5 |  135.3 |
| 2026-03 |      17 |   79.9 |
| 2026-04 |      23 |   78   |
| 2026-05 |      17 | -222.1 |

by weekday:
| weekday   |   count |    sum |
|:----------|--------:|-------:|
| Fri       |      20 |  359.8 |
| Mon       |      15 |  -84.7 |
| Thu       |      20 | -373.4 |
| Tue       |      18 |  215   |
| Wed       |      25 |  334.8 |

by exit reason:
| exit_reason   |   count |     sum |
|:--------------|--------:|--------:|
| sl            |      44 | -3788.3 |
| time          |      27 |   515.7 |
| tp            |      27 |  3724.2 |

### idx_breakout_15_retest
by month:
| month   |   count |   sum |
|:--------|--------:|------:|
| 2025-11 |       3 |  67.6 |
| 2025-12 |      17 | 238.8 |
| 2026-01 |      12 | 688.6 |
| 2026-02 |       7 | 173   |
| 2026-03 |      16 |  16   |
| 2026-04 |      24 | 136   |
| 2026-05 |      16 | -36.2 |

by weekday:
| weekday   |   count |   sum |
|:----------|--------:|------:|
| Fri       |      18 | 445.5 |
| Mon       |      17 | -57.2 |
| Thu       |      21 | -85.6 |
| Tue       |      18 | 301.2 |
| Wed       |      21 | 679.8 |

by exit reason:
| exit_reason   |   count |     sum |
|:--------------|--------:|--------:|
| sl            |      38 | -3222.2 |
| time          |      27 |   416.7 |
| tp            |      30 |  4089.3 |



## TASK 4 — Checks

**Expectancy recompute vs reported:**

| variant                |   reported |   recomputed | match   |
|:-----------------------|-----------:|-------------:|:--------|
| idx_breakout_15        |       4.61 |         4.61 | OK      |
| idx_breakout_15_retest |      13.51 |        13.51 | OK      |
| idx_fade_15            |      -5.27 |        -5.27 | OK      |
| idx_breakout_30        |      -7.46 |        -7.46 | OK      |
| idx_fade_30            |     -19.19 |       -19.19 | OK      |

**Top-5-trade concentration:**

| variant                |   total_pts |   top5_pts | top5_share   |
|:-----------------------|------------:|-----------:|:-------------|
| idx_breakout_15        |       451.6 |      867.2 | 192%         |
| idx_breakout_15_retest |      1283.8 |      867.2 | 68%          |
| idx_breakout_15_relvol |        24.3 |       24.3 | 100%         |
| idx_fade_15            |      -422   |      756.6 | -179%        |
| idx_breakout_30        |      -291   |      648   | -223%        |
| idx_fade_30            |      -633.3 |      723.3 | -114%        |

**Overlap breakout_15 ∩ retest (same session date):** 62 (n=98/95).

**Expectancy vs spread assumption (pts/trade):**

| variant                |   exp@1.1 |   exp@actual |   exp@3.5 |
|:-----------------------|----------:|-------------:|----------:|
| idx_breakout_15        |      4.54 |         4.61 |      2.14 |
| idx_breakout_15_retest |     13.46 |        13.51 |     11.06 |
| idx_breakout_15_relvol |      5.02 |         4.86 |      2.62 |
| idx_fade_15            |     -5.31 |        -5.27 |     -7.71 |
| idx_breakout_30        |     -7.56 |        -7.46 |     -9.96 |
| idx_fade_30            |    -19.28 |       -19.19 |    -21.68 |

**Oddities:**

| variant                |   entries_outside_0930_1600 |   duplicate_rows |   missing_exit |
|:-----------------------|----------------------------:|-----------------:|---------------:|
| idx_breakout_15        |                           0 |                0 |              0 |
| idx_breakout_15_retest |                           0 |                0 |              0 |
| idx_breakout_15_relvol |                           0 |                0 |              0 |
| idx_fade_15            |                           0 |                0 |              0 |
| idx_breakout_30        |                           0 |                0 |              0 |
| idx_fade_30            |                           0 |                0 |              0 |