-- Multi-timeframe support for candles.
--
-- The original PK (pair, ts) allows only ONE timeframe per pair. To store
-- native M15 / M5 (which cannot be resampled up from H1) alongside H1 we add a
-- `tf` column and make the identity (pair, tf, ts). Existing rows are all H1,
-- so the DEFAULT 'H1' backfills them correctly.
--
-- On a TimescaleDB hypertable any unique/primary index must include the
-- partition column (ts); (pair, tf, ts) does, so this is allowed. Idempotent.

ALTER TABLE candles ADD COLUMN IF NOT EXISTS tf TEXT NOT NULL DEFAULT 'H1';

ALTER TABLE candles DROP CONSTRAINT IF EXISTS candles_pkey;

ALTER TABLE candles ADD PRIMARY KEY (pair, tf, ts);

CREATE INDEX IF NOT EXISTS idx_candles_pair_tf_ts ON candles (pair, tf, ts DESC);
