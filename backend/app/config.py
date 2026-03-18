"""
NEXARB Scanner - Configuration
All environment variables and app-wide constants
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────────────
    APP_NAME: str = "NEXARB Scanner"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # ── Supabase ──────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""  # service_role key (bypasses RLS for background jobs)
    SUPABASE_ANON_KEY: str = ""

    # ── Telegram Bot ──────────────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""

    # ── CORS ──────────────────────────────────────────────────────────────
    # Add your Vercel frontend URL here
    ALLOWED_ORIGINS: list[str] = [
        "https://nexarb-scanner.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
        "https://*.vercel.app",
    ]

    # ── Cache TTL (seconds) ───────────────────────────────────────────────
    CEX_CACHE_TTL: int = 30        # CEX prices cache 30 seconds
    DEX_CACHE_TTL: int = 20        # DEX prices cache 20 seconds
    FUTURES_CACHE_TTL: int = 60    # Futures/funding cache 60 seconds

    # ── Scanner Settings ──────────────────────────────────────────────────
    # Exchanges to scan without API keys (public endpoints only)
    DEFAULT_CEX_EXCHANGES: list[str] = [
        "binance", "okx", "bybit", "kucoin", "gateio",
        "mexc", "htx", "bitget", "coinbase", "kraken",
        "cryptocom", "bitfinex", "poloniex", "phemex",
        "bingx", "lbank", "xt",
    ]

    # Top symbols to scan by default
    DEFAULT_SYMBOLS: list[str] = [
        "BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT",
        "SOL/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT",
        "MATIC/USDT", "DOT/USDT", "LINK/USDT", "UNI/USDT",
        "LTC/USDT", "TON/USDT", "SUI/USDT", "APT/USDT",
        "NEAR/USDT", "ARB/USDT", "OP/USDT", "INJ/USDT",
        "TRX/USDT", "ATOM/USDT", "FIL/USDT", "ICP/USDT",
    ]

    # Minimum spread % to include in results
    MIN_SPREAD_PCT: float = 0.3

    # Minimum 24h volume (USD) to include in results
    MIN_VOLUME_24H: float = 50_000.0

    # How many concurrent exchange requests
    MAX_CONCURRENT_EXCHANGES: int = 8

    # Max results per scan response
    MAX_SCAN_RESULTS: int = 100

    # ── Background Job Intervals ──────────────────────────────────────────
    CEX_SCAN_INTERVAL_SEC: int = 30
    DEX_SCAN_INTERVAL_SEC: int = 20
    FUTURES_SCAN_INTERVAL_SEC: int = 60
    ALERT_CHECK_INTERVAL_SEC: int = 30

    # ── DexScreener API ───────────────────────────────────────────────────
    DEXSCREENER_BASE_URL: str = "https://api.dexscreener.com/latest"
    JUPITER_BASE_URL: str = "https://price.jup.ag/v6"

    # ── Rate limiting ─────────────────────────────────────────────────────
    # Per-exchange request interval (ms) when no API key
    DEFAULT_RATE_LIMIT_MS: int = 1000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()

# ── Supported CEX for UI display ─────────────────────────────────────────────
EXCHANGE_META = {
    "binance":   {"name": "Binance",    "color": "#F0B90B", "logo": "binance"},
    "okx":       {"name": "OKX",        "color": "#FFFFFF", "logo": "okx"},
    "bybit":     {"name": "Bybit",      "color": "#F7A600", "logo": "bybit"},
    "kucoin":    {"name": "KuCoin",     "color": "#23AF91", "logo": "kucoin"},
    "gateio":    {"name": "Gate.io",    "color": "#2354E6", "logo": "gateio"},
    "mexc":      {"name": "MEXC",       "color": "#2196F3", "logo": "mexc"},
    "htx":       {"name": "HTX",        "color": "#1573D5", "logo": "htx"},
    "bitget":    {"name": "Bitget",     "color": "#00F0FF", "logo": "bitget"},
    "coinbase":  {"name": "Coinbase",   "color": "#0052FF", "logo": "coinbase"},
    "kraken":    {"name": "Kraken",     "color": "#5741D9", "logo": "kraken"},
    "cryptocom": {"name": "Crypto.com", "color": "#002D74", "logo": "cryptocom"},
    "bitfinex":  {"name": "Bitfinex",   "color": "#16B157", "logo": "bitfinex"},
    "phemex":    {"name": "Phemex",     "color": "#4A90E2", "logo": "phemex"},
    "bingx":     {"name": "BingX",      "color": "#1DA2B4", "logo": "bingx"},
    "lbank":     {"name": "LBank",      "color": "#26A69A", "logo": "lbank"},
    "xt":        {"name": "XT.com",     "color": "#E6007A", "logo": "xt"},
    "poloniex":  {"name": "Poloniex",   "color": "#00A3CC", "logo": "poloniex"},
}

# ── Supported Chains for DEX ──────────────────────────────────────────────────
CHAIN_META = {
    "ethereum": {"name": "Ethereum", "color": "#627EEA", "symbol": "ETH"},
    "bsc":      {"name": "BSC",      "color": "#F0B90B", "symbol": "BNB"},
    "solana":   {"name": "Solana",   "color": "#9945FF", "symbol": "SOL"},
    "arbitrum": {"name": "Arbitrum", "color": "#28A0F0", "symbol": "ARB"},
    "polygon":  {"name": "Polygon",  "color": "#8247E5", "symbol": "MATIC"},
    "base":     {"name": "Base",     "color": "#0052FF", "symbol": "ETH"},
    "ton":      {"name": "TON",      "color": "#0098EA", "symbol": "TON"},
    "avalanche":{"name": "Avalanche","color": "#E84142", "symbol": "AVAX"},
}
