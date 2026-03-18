from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    APP_NAME: str = "NEXARB Scanner"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SUPABASE_ANON_KEY: str = ""
    CRYPTOBOT_TOKEN: str = ""

    TELEGRAM_BOT_TOKEN: str = ""

    ALLOWED_ORIGINS: List[str] = [
    "https://nexarb-scanner.vercel.app",
    "https://nexarb-scanner-ribb97gqs-shepintolik4-3840s-projects.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
]

    CEX_CACHE_TTL: int = 30
    DEX_CACHE_TTL: int = 20
    FUTURES_CACHE_TTL: int = 60

    DEFAULT_CEX_EXCHANGES: List[str] = [
        "binance", "okx", "bybit", "kucoin", "gateio", "mexc", "htx", "bitget",
    ]

    DEFAULT_SYMBOLS: List[str] = [
        "BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT",
        "SOL/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT",
        "LTC/USDT", "TON/USDT", "UNI/USDT", "MATIC/USDT",
    ]

    MIN_SPREAD_PCT: float = 0.3
    MIN_VOLUME_24H: float = 50000.0
    MAX_CONCURRENT_EXCHANGES: int = 3
    MAX_SCAN_RESULTS: int = 50

    CEX_SCAN_INTERVAL_SEC: int = 30
    DEX_SCAN_INTERVAL_SEC: int = 20
    FUTURES_SCAN_INTERVAL_SEC: int = 60
    ALERT_CHECK_INTERVAL_SEC: int = 30

    DEXSCREENER_BASE_URL: str = "https://api.dexscreener.com/latest"
    JUPITER_BASE_URL: str = "https://price.jup.ag/v6"
    DEFAULT_RATE_LIMIT_MS: int = 1000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

EXCHANGE_META = {
    "binance":  {"name": "Binance",  "color": "#F0B90B"},
    "okx":      {"name": "OKX",      "color": "#FFFFFF"},
    "bybit":    {"name": "Bybit",    "color": "#F7A600"},
    "kucoin":   {"name": "KuCoin",   "color": "#23AF91"},
    "gateio":   {"name": "Gate.io",  "color": "#2354E6"},
    "mexc":     {"name": "MEXC",     "color": "#2196F3"},
    "htx":      {"name": "HTX",      "color": "#1573D5"},
    "bitget":   {"name": "Bitget",   "color": "#00F0FF"},
}

CHAIN_META = {
    "ethereum": {"name": "Ethereum", "color": "#627EEA", "symbol": "ETH"},
    "bsc":      {"name": "BSC",      "color": "#F0B90B", "symbol": "BNB"},
    "solana":   {"name": "Solana",   "color": "#9945FF", "symbol": "SOL"},
    "arbitrum": {"name": "Arbitrum", "color": "#28A0F0", "symbol": "ARB"},
    "polygon":  {"name": "Polygon",  "color": "#8247E5", "symbol": "MATIC"},
    "base":     {"name": "Base",     "color": "#0052FF", "symbol": "ETH"},
    "ton":      {"name": "TON",      "color": "#0098EA", "symbol": "TON"},
}