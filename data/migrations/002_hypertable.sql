-- Convert the candles table into a TimescaleDB hypertable partitioned on ts,
-- but only when the timescaledb extension is actually available on the server.
--
-- The project's docker-compose uses the timescale/timescaledb image, but a
-- plain PostgreSQL (e.g. a local Homebrew server on the same port) has no
-- timescaledb.control file and would error on CREATE EXTENSION. Guarding on
-- pg_available_extensions makes this migration a safe no-op on plain Postgres
-- and a hypertable conversion on a Timescale server -- either way `migrate`
-- completes cleanly.
--
-- All statements are idempotent: CREATE EXTENSION IF NOT EXISTS, and
-- create_hypertable(..., if_not_exists => TRUE, migrate_data => TRUE) which
-- migrates existing rows if candles is still a plain table. The (pair, ts)
-- primary key from 001 already includes the ts partition column TimescaleDB
-- requires.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
        CREATE EXTENSION IF NOT EXISTS timescaledb;
        PERFORM create_hypertable('candles', 'ts',
                                  if_not_exists => TRUE, migrate_data => TRUE);
        RAISE NOTICE 'candles is now a TimescaleDB hypertable';
    ELSE
        RAISE NOTICE 'timescaledb not available; leaving candles as a plain table';
    END IF;
END
$$;
