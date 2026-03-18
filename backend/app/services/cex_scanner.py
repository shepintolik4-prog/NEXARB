"""
NEXARB Scanner - CEX Scanner Service
Fetches prices from CEX via CCXT and calculates arbitrage spreads
Supports both public endpoints (no keys) and user-provided API keys
"""
import asyncio
import ccxt.async_support as ccxt
import logging
import time
from typing import Optional
from datetime import datetime, timezone

from app.config import settings, EXCHANGE_META
from app.models import SpreadResult
from app.services.cache import ticker_cache, make_ticker_key

logger = logging.getLogger(__name__)

# ── Exchange instance pool ────────────────────────────────────────────────────
_exchange_instances: dict[str, ccxt.Exchange] = {}


def _create_exchange(exchange_id: str, api_key: str = None,
                     api_secret: str = None, passphrase: str = None) -> ccxt.Exchange:
    """Create a CCXT exchange instance with optional API credentials"""
    exchange_class = getattr(ccxt, exchange_id, None)
    if exchange_class is None:
        raise ValueError(f"Exchange {exchange_id} not supported by CCXT")

    config = {
        "enableRateLimit": True,
        "timeout": 8000,
        "options": {"defaultType": "spot"},
    }

    if api_key and api_secret:
        config["apiKey"] = api_key
        config["secret"] = api_secret
        if passphrase:
            config["password"] = passphrase
    
    return exchange_class(config)


def get_exchange(exchange_id: str, api_key: str = None,
                 api_secret: str = None, passphrase: str = None) -> ccxt.Exchange:
    """Get or create exchange instance from pool"""
    # If user keys provided, always create fresh instance
    if api_key:
        return _create_exchange(exchange_id, api_key, api_secret, passphrase)
    
    if exchange_id not in _exchange_instances:
        _exchange_instances[exchange_id] = _create_exchange(exchange_id)
    return _exchange_instances[exchange_id]


async def close_all_exchanges():
    """Cleanup - call on app shutdown"""
    for ex in _exchange_instances.values():
        try:
            await ex.close()
        except Exception:
            pass
    _exchange_instances.clear()


# ── Single ticker fetch with cache ───────────────────────────────────────────

async def fetch_ticker(exchange_id: str, symbol: str,
                       api_key: str = None, api_secret: str = None,
                       passphrase: str = None) -> Optional[dict]:
    """
    Fetch ticker for a symbol on an exchange.
    Caches result for CEX_CACHE_TTL seconds.
    Returns: {"bid": float, "ask": float, "last": float, "baseVolume": float, "quoteVolume": float}
    """
    cache_key = make_ticker_key(exchange_id, symbol)
    
    # Only use cache for keyless (public) requests
    if not api_key:
        cached = await ticker_cache.get(cache_key)
        if cached is not None:
            return cached

    try:
        exchange = get_exchange(exchange_id, api_key, api_secret, passphrase)
        ticker = await exchange.fetch_ticker(symbol)
        
        result = {
            "exchange": exchange_id,
            "symbol": symbol,
            "bid": ticker.get("bid") or ticker.get("last"),
            "ask": ticker.get("ask") or ticker.get("last"),
            "last": ticker.get("last"),
            "baseVolume": ticker.get("baseVolume", 0) or 0,
            "quoteVolume": ticker.get("quoteVolume", 0) or 0,
            "timestamp": ticker.get("timestamp"),
        }

        # Skip if no valid price
        if not result["bid"] or not result["ask"]:
            return None
        
        if not api_key:
            await ticker_cache.set(cache_key, result, settings.CEX_CACHE_TTL)
        
        return result

    except ccxt.NetworkError as e:
        logger.debug(f"Network error {exchange_id}/{symbol}: {e}")
    except ccxt.ExchangeError as e:
        logger.debug(f"Exchange error {exchange_id}/{symbol}: {e}")
    except Exception as e:
        logger.debug(f"Unexpected error {exchange_id}/{symbol}: {e}")
    
    return None


# ── Batch fetch across exchanges for one symbol ───────────────────────────────

async def fetch_symbol_across_exchanges(
    symbol: str,
    exchange_ids: list[str],
    user_keys: dict = None,
    semaphore: asyncio.Semaphore = None,
) -> list[dict]:
    """
    Fetch price for one symbol across multiple exchanges concurrently.
    Returns list of successful ticker results.
    """
    user_keys = user_keys or {}
    sem = semaphore or asyncio.Semaphore(settings.MAX_CONCURRENT_EXCHANGES)

    async def _fetch_with_sem(ex_id: str):
        keys = user_keys.get(ex_id, {})
        async with sem:
            return await fetch_ticker(
                ex_id, symbol,
                api_key=keys.get("key"),
                api_secret=keys.get("secret"),
                passphrase=keys.get("passphrase"),
            )

    tasks = [_fetch_with_sem(ex_id) for ex_id in exchange_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    return [r for r in results if r and not isinstance(r, Exception)]


# ── Main spread calculation ───────────────────────────────────────────────────

def calculate_spreads(tickers: list[dict], min_spread_pct: float = 0.3,
                      min_volume_24h: float = 50_000.0) -> list[SpreadResult]:
    """
    Given a list of tickers for the same symbol, find all viable spreads.
    Returns list of SpreadResult sorted by spread_pct DESC.
    """
    if len(tickers) < 2:
        return []

    spreads = []
    
    # Compare every pair (buy on A, sell on B and vice versa)
    for i in range(len(tickers)):
        for j in range(len(tickers)):
            if i == j:
                continue
            
            buy_ticker = tickers[i]  # we buy here (use ask price)
            sell_ticker = tickers[j]  # we sell here (use bid price)
            
            buy_price = buy_ticker.get("ask") or buy_ticker.get("last", 0)
            sell_price = sell_ticker.get("bid") or sell_ticker.get("last", 0)
            
            if not buy_price or not sell_price or buy_price <= 0:
                continue
            
            spread_pct = (sell_price - buy_price) / buy_price * 100
            
            if spread_pct < min_spread_pct:
                continue
            
            # Volume check - use quote volume (USD equivalent)
            vol_buy = buy_ticker.get("quoteVolume") or (
                buy_ticker.get("baseVolume", 0) * buy_price
            )
            vol_sell = sell_ticker.get("quoteVolume") or (
                sell_ticker.get("baseVolume", 0) * sell_price
            )
            min_vol = min(vol_buy or 0, vol_sell or 0)
            
            if min_vol < min_volume_24h:
                continue
            
            symbol = buy_ticker["symbol"]
            parts = symbol.split("/")
            
            spreads.append(SpreadResult(
                symbol=symbol,
                base=parts[0] if len(parts) == 2 else symbol,
                quote=parts[1] if len(parts) == 2 else "USDT",
                exchange_buy=buy_ticker["exchange"],
                exchange_sell=sell_ticker["exchange"],
                price_buy=buy_price,
                price_sell=sell_price,
                spread_pct=round(spread_pct, 4),
                spread_usd=round(sell_price - buy_price, 6),
                volume_24h_buy=round(vol_buy, 2) if vol_buy else None,
                volume_24h_sell=round(vol_sell, 2) if vol_sell else None,
                min_volume_24h=round(min_vol, 2) if min_vol else None,
                scanned_at=datetime.now(timezone.utc),
            ))
    
    # Sort by spread % descending
    spreads.sort(key=lambda x: x.spread_pct, reverse=True)
    
    # Remove duplicates (A→B and B→A for same spread, keep only positive)
    return spreads


# ── Full CEX scan ─────────────────────────────────────────────────────────────

async def run_cex_scan(
    symbols: list[str] = None,
    exchanges: list[str] = None,
    min_spread_pct: float = 0.5,
    min_volume_24h: float = 50_000.0,
    quote_currency: str = "USDT",
    user_api_keys: dict = None,
    limit: int = 100,
) -> tuple[list[SpreadResult], list[str], float]:
    """
    Run full CEX arbitrage scan.
    Returns (results, scanned_exchanges, duration_ms)
    """
    start_time = time.time()
    
    symbols = symbols or settings.DEFAULT_SYMBOLS
    exchanges = exchanges or settings.DEFAULT_CEX_EXCHANGES
    user_api_keys = user_api_keys or {}
    
    # Filter to USDT pairs if quote_currency specified
    if quote_currency:
        symbols = [s for s in symbols if s.endswith(f"/{quote_currency}")]
    
    # Semaphore to limit concurrent requests across all exchanges
    semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_EXCHANGES)
    
    all_results: list[SpreadResult] = []
    scanned_exchanges = set()
    
    # Scan each symbol across all exchanges concurrently
    symbol_tasks = [
        fetch_symbol_across_exchanges(sym, exchanges, user_api_keys, semaphore)
        for sym in symbols
    ]
    
    symbol_results = await asyncio.gather(*symbol_tasks, return_exceptions=True)
    
    for tickers in symbol_results:
        if isinstance(tickers, Exception) or not tickers:
            continue
        
        # Track which exchanges responded
        for t in tickers:
            scanned_exchanges.add(t["exchange"])
        
        # Calculate spreads for this symbol
        spreads = calculate_spreads(tickers, min_spread_pct, min_volume_24h)
        all_results.extend(spreads)
    
    # Sort all results by spread %
    all_results.sort(key=lambda x: x.spread_pct, reverse=True)
    
    duration_ms = (time.time() - start_time) * 1000
    
    return all_results[:limit], sorted(list(scanned_exchanges)), round(duration_ms, 1)
