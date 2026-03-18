"""
NEXARB Scanner - Futures Scanner Service
Calculates spot vs perpetual futures spreads and funding rates
Uses CCXT for both spot and futures markets
"""
import asyncio
import ccxt.async_support as ccxt
import logging
import time
from typing import Optional
from datetime import datetime, timezone

from app.config import settings
from app.models import FuturesSpreadResult
from app.services.cache import futures_cache, make_futures_key

logger = logging.getLogger(__name__)

# Exchanges that support both spot and perpetual futures via CCXT
FUTURES_EXCHANGES = {
    "binance":  {"spot": "binance",  "futures": "binanceusdm"},
    "okx":      {"spot": "okx",      "futures": "okx"},
    "bybit":    {"spot": "bybit",    "futures": "bybit"},
    "bitget":   {"spot": "bitget",   "futures": "bitget"},
    "gateio":   {"spot": "gateio",   "futures": "gateio"},
    "htx":      {"spot": "htx",      "futures": "htx"},
    "mexc":     {"spot": "mexc",     "futures": "mexc"},
    "phemex":   {"spot": "phemex",   "futures": "phemex"},
    "bingx":    {"spot": "bingx",    "futures": "bingx"},
}

_futures_exchange_instances: dict[str, ccxt.Exchange] = {}


def _get_futures_exchange(exchange_id: str, market_type: str = "swap") -> ccxt.Exchange:
    key = f"{exchange_id}:{market_type}"
    if key not in _futures_exchange_instances:
        exchange_class = getattr(ccxt, exchange_id, None)
        if not exchange_class:
            raise ValueError(f"Exchange {exchange_id} not in CCXT")
        
        config = {
            "enableRateLimit": True,
            "timeout": 8000,
            "options": {"defaultType": market_type},
        }
        _futures_exchange_instances[key] = exchange_class(config)
    
    return _futures_exchange_instances[key]


async def fetch_spot_price(exchange_id: str, symbol: str) -> Optional[float]:
    """Fetch spot price for a symbol"""
    try:
        ex = _get_futures_exchange(exchange_id, "spot")
        ticker = await ex.fetch_ticker(symbol)
        return ticker.get("last") or ticker.get("bid")
    except Exception as e:
        logger.debug(f"Spot price error {exchange_id}/{symbol}: {e}")
        return None


async def fetch_futures_data(exchange_id: str, symbol: str) -> Optional[dict]:
    """
    Fetch futures price + funding rate for a symbol.
    Returns dict with price, funding_rate, next_funding_time, open_interest
    """
    try:
        ex = _get_futures_exchange(exchange_id, "swap")
        
        # Convert spot symbol to futures symbol format
        futures_symbol = symbol.replace("/USDT", "/USDT:USDT")  # CCXT unified format
        
        # Fetch ticker
        ticker = await ex.fetch_ticker(futures_symbol)
        futures_price = ticker.get("last") or ticker.get("bid")
        
        if not futures_price:
            return None
        
        result = {
            "exchange": exchange_id,
            "symbol": symbol,
            "futures_price": futures_price,
            "volume_24h": ticker.get("quoteVolume") or (
                (ticker.get("baseVolume") or 0) * futures_price
            ),
            "funding_rate": None,
            "next_funding_time": None,
            "open_interest": None,
        }
        
        # Try to fetch funding rate (not all exchanges support this without auth)
        try:
            funding = await ex.fetch_funding_rate(futures_symbol)
            if funding:
                result["funding_rate"] = funding.get("fundingRate")
                next_time = funding.get("nextFundingDatetime") or funding.get("nextFundingTime")
                if next_time:
                    if isinstance(next_time, (int, float)):
                        result["next_funding_time"] = datetime.fromtimestamp(
                            next_time / 1000, tz=timezone.utc
                        )
                    else:
                        result["next_funding_time"] = next_time
        except Exception:
            pass  # Funding rate is optional
        
        return result
        
    except Exception as e:
        logger.debug(f"Futures data error {exchange_id}/{symbol}: {e}")
        return None


async def scan_futures_pair(
    exchange_id: str,
    symbol: str,
    semaphore: asyncio.Semaphore,
) -> Optional[FuturesSpreadResult]:
    """
    Fetch spot and futures prices for a symbol on the same exchange,
    calculate spot-futures spread.
    """
    async with semaphore:
        spot_task = fetch_spot_price(exchange_id, symbol)
        futures_task = fetch_futures_data(exchange_id, symbol)
        
        spot_price, futures_data = await asyncio.gather(
            spot_task, futures_task, return_exceptions=True
        )
    
    if isinstance(spot_price, Exception) or not spot_price:
        return None
    if isinstance(futures_data, Exception) or not futures_data:
        return None
    
    futures_price = futures_data["futures_price"]
    spread_pct = (futures_price - spot_price) / spot_price * 100
    
    funding_rate = futures_data.get("funding_rate")
    funding_annual = None
    if funding_rate is not None:
        # 3 funding periods per day × 365 days
        funding_annual = funding_rate * 3 * 365 * 100  # as percentage
    
    parts = symbol.split("/")
    
    return FuturesSpreadResult(
        symbol=symbol,
        base=parts[0] if len(parts) == 2 else symbol,
        spot_exchange=exchange_id,
        futures_exchange=exchange_id,
        spot_price=spot_price,
        futures_price=futures_price,
        spread_pct=round(spread_pct, 4),
        funding_rate=round(funding_rate, 6) if funding_rate is not None else None,
        funding_rate_annual=round(funding_annual, 2) if funding_annual is not None else None,
        next_funding_time=futures_data.get("next_funding_time"),
        volume_24h=round(futures_data.get("volume_24h", 0), 2),
        direction="long_spot_short_futures" if spread_pct > 0 else "short_spot_long_futures",
        scanned_at=datetime.now(timezone.utc),
    )


async def run_futures_scan(
    symbols: list[str] = None,
    exchanges: list[str] = None,
    min_spread_pct: float = 0.3,
    include_funding: bool = True,
    limit: int = 100,
) -> tuple[list[FuturesSpreadResult], float]:
    """
    Run full spot-futures scan across supported exchanges.
    Returns (results, duration_ms)
    """
    start_time = time.time()
    
    symbols = symbols or [s for s in settings.DEFAULT_SYMBOLS if "/USDT" in s]
    exchanges_to_scan = [
        ex for ex in (exchanges or list(FUTURES_EXCHANGES.keys()))
        if ex in FUTURES_EXCHANGES
    ]
    
    # Check cache
    cache_key = make_futures_key(exchanges_to_scan, symbols)
    cached = await futures_cache.get(cache_key)
    if cached:
        duration_ms = (time.time() - start_time) * 1000
        return cached, round(duration_ms, 1)
    
    semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_EXCHANGES)
    
    tasks = [
        scan_futures_pair(ex, sym, semaphore)
        for ex in exchanges_to_scan
        for sym in symbols
    ]
    
    results_raw = await asyncio.gather(*tasks, return_exceptions=True)
    
    results = [
        r for r in results_raw
        if r and not isinstance(r, Exception)
        and abs(r.spread_pct) >= min_spread_pct
    ]
    
    # Sort by absolute spread % DESC
    results.sort(key=lambda x: abs(x.spread_pct), reverse=True)
    results = results[:limit]
    
    # Cache results
    await futures_cache.set(cache_key, results, settings.FUTURES_CACHE_TTL)
    
    duration_ms = (time.time() - start_time) * 1000
    return results, round(duration_ms, 1)


async def run_funding_rates_scan(
    exchanges: list[str] = None,
    symbols: list[str] = None,
) -> list[dict]:
    """
    Fetch current funding rates across exchanges.
    Returns list sorted by highest funding rate (most profitable for funding arb).
    """
    exchanges_to_scan = [
        ex for ex in (exchanges or list(FUTURES_EXCHANGES.keys()))
        if ex in FUTURES_EXCHANGES
    ]
    symbols = symbols or [s for s in settings.DEFAULT_SYMBOLS if "/USDT" in s]
    
    semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_EXCHANGES)
    
    async def _fetch_funding(exchange_id: str, symbol: str):
        async with semaphore:
            try:
                ex = _get_futures_exchange(exchange_id, "swap")
                futures_symbol = symbol.replace("/USDT", "/USDT:USDT")
                funding = await ex.fetch_funding_rate(futures_symbol)
                if not funding:
                    return None
                
                rate = funding.get("fundingRate")
                if rate is None:
                    return None
                
                return {
                    "exchange": exchange_id,
                    "symbol": symbol,
                    "funding_rate": round(rate * 100, 6),  # as %
                    "funding_rate_8h": round(rate * 100, 6),
                    "funding_rate_annual": round(rate * 3 * 365 * 100, 2),
                    "next_funding_time": funding.get("nextFundingDatetime"),
                    "scanned_at": datetime.now(timezone.utc).isoformat(),
                }
            except Exception as e:
                logger.debug(f"Funding rate error {exchange_id}/{symbol}: {e}")
                return None
    
    tasks = [
        _fetch_funding(ex, sym)
        for ex in exchanges_to_scan
        for sym in symbols
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    valid = [r for r in results if r and not isinstance(r, Exception)]
    
    # Sort by absolute funding rate (both positive and negative are interesting)
    valid.sort(key=lambda x: abs(x["funding_rate"]), reverse=True)
    
    return valid
