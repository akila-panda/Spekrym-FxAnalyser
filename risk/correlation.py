import pandas as pd


def compute_correlation_matrix(price_series: dict[str, pd.Series]) -> pd.DataFrame:
    """Pairwise correlation of log returns across pairs' close-price series."""
    returns = {}
    for pair, closes in price_series.items():
        s = pd.Series(closes).astype(float)
        returns[pair] = s.pct_change().dropna()
    df = pd.DataFrame(returns)
    return df.corr()


def check_correlation_exposure(open_positions: list[dict], corr_matrix: pd.DataFrame,
                                threshold: float = 0.7) -> list[dict]:
    """open_positions: [{"pair": "EUR_USD", "direction": "long"}, ...]
    Flags pairs of open positions whose combined direction stacks correlated risk:
    - same direction on positively correlated pairs, or
    - opposite direction on negatively correlated pairs.
    """
    warnings = []
    n = len(open_positions)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = open_positions[i], open_positions[j]
            if a["pair"] not in corr_matrix or b["pair"] not in corr_matrix:
                continue
            corr = corr_matrix.loc[a["pair"], b["pair"]]
            same_direction = a["direction"] == b["direction"]
            stacked = (corr >= threshold and same_direction) or (corr <= -threshold and not same_direction)
            if stacked:
                warnings.append({
                    "pair_a": a["pair"], "pair_b": b["pair"],
                    "correlation": round(float(corr), 3),
                    "message": f"{a['pair']} ({a['direction']}) and {b['pair']} ({b['direction']}) "
                               f"stack correlated exposure (corr={corr:.2f})",
                })
    return warnings