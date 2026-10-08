-- Bid/ask columns for realistic spread modeling (scalping Phase A).
--
-- Existing o/h/l/c stay as the MID price. These nullable columns hold the true
-- bid and ask OHLC (from OANDA price="MBA"); spread at any bar = ask_c - bid_c.
-- Rows ingested mid-only leave these NULL. Idempotent.

ALTER TABLE candles ADD COLUMN IF NOT EXISTS bid_o DOUBLE PRECISION;
ALTER TABLE candles ADD COLUMN IF NOT EXISTS bid_h DOUBLE PRECISION;
ALTER TABLE candles ADD COLUMN IF NOT EXISTS bid_l DOUBLE PRECISION;
ALTER TABLE candles ADD COLUMN IF NOT EXISTS bid_c DOUBLE PRECISION;
ALTER TABLE candles ADD COLUMN IF NOT EXISTS ask_o DOUBLE PRECISION;
ALTER TABLE candles ADD COLUMN IF NOT EXISTS ask_h DOUBLE PRECISION;
ALTER TABLE candles ADD COLUMN IF NOT EXISTS ask_l DOUBLE PRECISION;
ALTER TABLE candles ADD COLUMN IF NOT EXISTS ask_c DOUBLE PRECISION;
