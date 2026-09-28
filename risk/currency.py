"""Account-currency conversion for P/L and position sizing.

A pair BASE_QUOTE is priced as `quote units per 1 base unit`. Trading `units`
of the base produces a raw P/L measured in the QUOTE currency:

    pnl_quote = (exit - entry) * units          # long; short is the mirror

That P/L (and the per-unit stop distance used for sizing) is only in the
account currency when QUOTE == account currency. For every other pair it has
to be converted, or position sizes and returns are silently wrong -- e.g. a
USD_JPY move is in JPY, ~150x smaller in USD terms.

Only pairs where one side is the account currency can be converted from the
pair's own price alone:

    - QUOTE == account (EUR_USD, GBP_USD, AUD_USD for a USD account): identity.
    - BASE  == account (USD_JPY, USD_CAD for a USD account): divide by the
      price, since price = quote per base = quote per account.

A genuine cross (neither side is the account currency, e.g. EUR_GBP on a USD
account) needs a separate quote->account exchange rate that this pair's price
does not carry, so it raises rather than returning a wrong number.
"""


def split_pair(pair: str) -> tuple[str, str]:
    """'EUR_USD' -> ('EUR', 'USD'). Accepts '/' as a separator too."""
    sep = "_" if "_" in pair else "/"
    base, _, quote = pair.partition(sep)
    if not base or not quote:
        raise ValueError(f"unrecognized pair format: {pair!r}")
    return base.upper(), quote.upper()


def quote_to_account(amount_quote: float, pair: str, price: float,
                     account_ccy: str = "USD") -> float:
    """Convert an amount expressed in `pair`'s quote currency into the account
    currency, using the pair's own `price`. `price` should be the rate at the
    moment the amount is realized (entry price for sizing, exit price for P/L).

    Raises NotImplementedError for true cross pairs, which need an external
    rate this function is not given.
    """
    base, quote = split_pair(pair)
    account_ccy = account_ccy.upper()

    if quote == account_ccy:
        return amount_quote
    if base == account_ccy:
        if price <= 0:
            raise ValueError("price must be > 0 to convert a base-currency pair")
        return amount_quote / price

    raise NotImplementedError(
        f"cross pair {pair} needs an explicit {quote}->{account_ccy} rate; "
        f"its own price cannot convert to {account_ccy}"
    )
