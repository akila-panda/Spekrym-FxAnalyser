
CREATE TABLE IF NOT EXISTS candles (
    pair        TEXT        NOT NULL,
    ts          TIMESTAMPTZ NOT NULL,
    o           DOUBLE PRECISION NOT NULL,
    h           DOUBLE PRECISION NOT NULL,
    l           DOUBLE PRECISION NOT NULL,
    c           DOUBLE PRECISION NOT NULL,
    v           BIGINT NOT NULL DEFAULT 0,
    complete    BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (pair, ts)
);

CREATE INDEX IF NOT EXISTS idx_candles_pair_ts ON candles (pair, ts DESC);

CREATE TABLE IF NOT EXISTS calendar_events (
    id          TEXT PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL,
    currency    TEXT NOT NULL,
    impact      TEXT NOT NULL,
    title       TEXT NOT NULL,
    actual      TEXT,
    forecast    TEXT,
    previous    TEXT,
    source      TEXT NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_ts ON calendar_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_currency ON calendar_events (currency);

CREATE TABLE IF NOT EXISTS ingestion_gaps (
    id          SERIAL PRIMARY KEY,
    pair        TEXT NOT NULL,
    gap_start   TIMESTAMPTZ NOT NULL,
    gap_end     TIMESTAMPTZ NOT NULL,
    missing_count INTEGER NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved    BOOLEAN NOT NULL DEFAULT FALSE
);