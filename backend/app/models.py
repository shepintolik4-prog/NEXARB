"""
NEXARB Scanner - Pydantic Models
Request/Response schemas for all API endpoints
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────────────

class AlertType(str, Enum):
    CEX_SPREAD = "cex_spread"
    FUTURES_SPREAD = "futures_spread"
    FUNDING_RATE = "funding_rate"
    DEX_SPREAD = "dex_spread"


class SnapshotType(str, Enum):
    CEX = "cex"
    FUTURES = "futures"
    DEX = "dex"


# ── Spread Models ─────────────────────────────────────────────────────────────

class SpreadResult(BaseModel):
    """Single arbitrage opportunity"""
    symbol: str                          # e.g. "BTC/USDT"
    base: str                            # e.g. "BTC"
    quote: str                           # e.g. "USDT"
    exchange_buy: str                    # exchange to buy on (lower price)
    exchange_sell: str                   # exchange to sell on (higher price)
    price_buy: float
    price_sell: float
    spread_pct: float                    # (sell - buy) / buy * 100
    spread_usd: Optional[float] = None  # spread in USD for 1 unit
    volume_24h_buy: Optional[float] = None
    volume_24h_sell: Optional[float] = None
    min_volume_24h: Optional[float] = None  # min of both sides
    scanned_at: Optional[datetime] = None

    @property
    def spread_formatted(self) -> str:
        return f"{self.spread_pct:.2f}%"


class FuturesSpreadResult(BaseModel):
    """Spot vs Futures arbitrage opportunity"""
    symbol: str
    base: str
    spot_exchange: str
    futures_exchange: str
    spot_price: float
    futures_price: float
    spread_pct: float                    # (futures - spot) / spot * 100
    funding_rate: Optional[float] = None  # current funding rate (8h)
    funding_rate_annual: Optional[float] = None  # annualized funding
    next_funding_time: Optional[datetime] = None
    open_interest: Optional[float] = None
    volume_24h: Optional[float] = None
    direction: str = "long_spot_short_futures"  # or "short_spot_long_futures"
    scanned_at: Optional[datetime] = None


class DexSpreadResult(BaseModel):
    """DEX arbitrage opportunity across chains/pools"""
    symbol: str
    base_token: str
    quote_token: str
    chain_buy: str
    chain_sell: str
    dex_buy: str
    dex_sell: str
    price_buy: float
    price_sell: float
    spread_pct: float
    liquidity_buy: Optional[float] = None
    liquidity_sell: Optional[float] = None
    volume_24h_buy: Optional[float] = None
    volume_24h_sell: Optional[float] = None
    pool_address_buy: Optional[str] = None
    pool_address_sell: Optional[str] = None
    scanned_at: Optional[datetime] = None


# ── Request Models ─────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    symbols: Optional[List[str]] = None    # None = use defaults
    exchanges: Optional[List[str]] = None  # None = use defaults
    min_spread_pct: float = Field(default=0.5, ge=0.0, le=100.0)
    min_volume_24h: float = Field(default=50000.0, ge=0.0)
    quote_currency: str = Field(default="USDT")
    limit: int = Field(default=50, ge=1, le=200)
    # Optional user API keys for extra exchanges
    user_api_keys: Optional[dict] = None  # {"binance": {"key": "...", "secret": "..."}}


class FuturesScanRequest(BaseModel):
    symbols: Optional[List[str]] = None
    exchanges: Optional[List[str]] = None
    min_spread_pct: float = Field(default=0.3, ge=0.0, le=100.0)
    include_funding: bool = True
    limit: int = Field(default=50, ge=1, le=200)


class DexScanRequest(BaseModel):
    tokens: Optional[List[str]] = None    # token symbols or addresses
    chains: Optional[List[str]] = None    # None = all chains
    min_spread_pct: float = Field(default=1.0, ge=0.0, le=100.0)
    min_liquidity_usd: float = Field(default=10000.0, ge=0.0)
    limit: int = Field(default=50, ge=1, le=200)


# ── Response Models ────────────────────────────────────────────────────────────

class ScanResponse(BaseModel):
    success: bool = True
    data: List[SpreadResult]
    total: int
    scanned_exchanges: List[str]
    scanned_symbols: int
    scan_duration_ms: Optional[float] = None
    cached: bool = False
    cached_at: Optional[datetime] = None


class FuturesScanResponse(BaseModel):
    success: bool = True
    data: List[FuturesSpreadResult]
    total: int
    scan_duration_ms: Optional[float] = None
    cached: bool = False


class DexScanResponse(BaseModel):
    success: bool = True
    data: List[DexSpreadResult]
    total: int
    chains_scanned: List[str]
    cached: bool = False


# ── User Models ────────────────────────────────────────────────────────────────

class TelegramUserInit(BaseModel):
    """Sent by TMA on first open"""
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    init_data: str  # raw Telegram.WebApp.initData for validation


class UserApiKeysUpdate(BaseModel):
    telegram_id: int
    exchange: str  # "binance", "okx", "bybit"
    api_key: str
    api_secret: str
    passphrase: Optional[str] = None  # for OKX


class UserResponse(BaseModel):
    telegram_id: int
    username: Optional[str]
    first_name: Optional[str]
    has_binance_key: bool = False
    has_okx_key: bool = False
    has_bybit_key: bool = False
    preferred_quote: str = "USDT"
    notifications_enabled: bool = True
    created_at: Optional[datetime] = None


# ── Alert Models ───────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    telegram_id: int
    alert_type: AlertType
    symbol: Optional[str] = None        # None = watch all symbols
    exchange_buy: Optional[str] = None  # None = any exchange
    exchange_sell: Optional[str] = None
    min_spread_pct: float = Field(default=1.0, ge=0.1, le=100.0)
    min_volume_24h: float = Field(default=100000.0, ge=0.0)
    max_funding_rate: Optional[float] = None
    cooldown_minutes: int = Field(default=30, ge=5, le=1440)


class AlertUpdate(BaseModel):
    alert_id: str
    telegram_id: int
    is_active: Optional[bool] = None
    min_spread_pct: Optional[float] = None
    min_volume_24h: Optional[float] = None
    cooldown_minutes: Optional[int] = None


class AlertResponse(BaseModel):
    id: str
    alert_type: AlertType
    symbol: Optional[str]
    exchange_buy: Optional[str]
    exchange_sell: Optional[str]
    min_spread_pct: float
    min_volume_24h: float
    is_active: bool
    last_triggered_at: Optional[datetime]
    trigger_count: int
    cooldown_minutes: int
    created_at: datetime


# ── WebSocket Models ───────────────────────────────────────────────────────────

class WSMessage(BaseModel):
    type: str  # "spread_update", "alert_trigger", "ping"
    data: Optional[dict] = None
    timestamp: Optional[datetime] = None
