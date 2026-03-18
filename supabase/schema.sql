-- =====================================================
-- NEXARB SCANNER - Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS TABLE
-- Stores Telegram users who use the TMA
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    -- User-provided API keys (encrypted in practice, stored as text here)
    binance_api_key TEXT,
    binance_api_secret TEXT,
    okx_api_key TEXT,
    okx_api_secret TEXT,
    okx_passphrase TEXT,
    bybit_api_key TEXT,
    bybit_api_secret TEXT,
    -- Preferences
    preferred_quote TEXT DEFAULT 'USDT',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ALERTS TABLE
-- User-defined alert rules
-- =====================================================
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    -- Alert configuration
    alert_type TEXT NOT NULL CHECK (alert_type IN ('cex_spread', 'futures_spread', 'funding_rate', 'dex_spread')),
    symbol TEXT,                    -- e.g. "BTC/USDT" or NULL for all
    exchange_buy TEXT,              -- e.g. "binance" or NULL for any
    exchange_sell TEXT,             -- e.g. "okx" or NULL for any
    -- Threshold values
    min_spread_pct DECIMAL(10, 4) DEFAULT 1.0,   -- minimum spread % to trigger
    min_volume_24h DECIMAL(20, 2) DEFAULT 100000, -- minimum 24h volume USD
    max_funding_rate DECIMAL(10, 6),              -- for funding alerts
    -- Alert status
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,
    -- Cooldown: don't re-alert within X minutes
    cooldown_minutes INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SPREAD_SNAPSHOTS TABLE
-- Cached scan results (30-second TTL logic handled in app)
-- =====================================================
CREATE TABLE IF NOT EXISTS spread_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('cex', 'futures', 'dex')),
    symbol TEXT NOT NULL,
    exchange_buy TEXT NOT NULL,
    exchange_sell TEXT NOT NULL,
    price_buy DECIMAL(30, 10) NOT NULL,
    price_sell DECIMAL(30, 10) NOT NULL,
    spread_pct DECIMAL(10, 4) NOT NULL,
    volume_24h_buy DECIMAL(20, 2),
    volume_24h_sell DECIMAL(20, 2),
    -- Futures-specific
    funding_rate DECIMAL(10, 6),
    next_funding_time TIMESTAMPTZ,
    -- DEX-specific
    chain TEXT,
    pool_address TEXT,
    liquidity_usd DECIMAL(20, 2),
    -- Metadata
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_snapshots_type_scanned ON spread_snapshots(snapshot_type, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_symbol ON spread_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_snapshots_spread ON spread_snapshots(spread_pct DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(telegram_id, is_active);

-- =====================================================
-- ALERT_HISTORY TABLE
-- Log of sent notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    message_text TEXT NOT NULL,
    spread_data JSONB,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own data
CREATE POLICY "users_own_data" ON users
    FOR ALL USING (telegram_id = current_setting('app.telegram_id', TRUE)::BIGINT);

CREATE POLICY "alerts_own_data" ON alerts
    FOR ALL USING (telegram_id = current_setting('app.telegram_id', TRUE)::BIGINT);

CREATE POLICY "alert_history_own_data" ON alert_history
    FOR ALL USING (telegram_id = current_setting('app.telegram_id', TRUE)::BIGINT);

-- spread_snapshots are public read (no user-specific data)
ALTER TABLE spread_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots_public_read" ON spread_snapshots
    FOR SELECT USING (TRUE);

-- Service role can write snapshots
CREATE POLICY "snapshots_service_write" ON spread_snapshots
    FOR INSERT WITH CHECK (TRUE);

-- Auto-cleanup: delete snapshots older than 5 minutes (run via pg_cron or app)
-- CREATE EXTENSION pg_cron;
-- SELECT cron.schedule('cleanup-snapshots', '*/5 * * * *',
--   'DELETE FROM spread_snapshots WHERE scanned_at < NOW() - INTERVAL ''5 minutes''');

-- =====================================================
-- HELPER FUNCTION: Updated_at trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
