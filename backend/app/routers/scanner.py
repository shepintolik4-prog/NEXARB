"""
NEXARB Scanner - CEX Scanner Router
Endpoints for CEX arbitrage scanning
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
import time

from app.models import ScanRequest, ScanResponse
from app.services.cex_scanner import run_cex_scan
from app.services.cache import cex_cache, make_cex_key
from app.config import settings, EXCHANGE_META

router = APIRouter(prefix="/api/scanner", tags=["CEX Scanner"])


@router.post("/scan", response_model=ScanResponse)
async def scan_cex_spreads(req: ScanRequest):
    """
    Run CEX arbitrage scan.
    Finds spread opportunities across exchanges for given symbols.
    Results are cached for 30 seconds.
    """
    start = time.time()
    
    # Check cache first (only for non-keyed requests)
    if not req.user_api_keys:
        cache_key = make_cex_key(
            req.exchanges or settings.DEFAULT_CEX_EXCHANGES,
            req.symbols or settings.DEFAULT_SYMBOLS,
            req.quote_currency,
            req.min_spread_pct,
        )
        cached = await cex_cache.get(cache_key)
        if cached:
            return ScanResponse(
                data=cached["data"],
                total=len(cached["data"]),
                scanned_exchanges=cached["scanned_exchanges"],
                scanned_symbols=cached["scanned_symbols"],
                scan_duration_ms=cached.get("duration_ms"),
                cached=True,
                cached_at=cached.get("cached_at"),
            )
    
    try:
        results, scanned_exchanges, duration_ms = await run_cex_scan(
            symbols=req.symbols,
            exchanges=req.exchanges,
            min_spread_pct=req.min_spread_pct,
            min_volume_24h=req.min_volume_24h,
            quote_currency=req.quote_currency,
            user_api_keys=req.user_api_keys,
            limit=req.limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")
    
    symbols_used = req.symbols or settings.DEFAULT_SYMBOLS
    
    response_data = {
        "data": results,
        "scanned_exchanges": scanned_exchanges,
        "scanned_symbols": len(symbols_used),
        "duration_ms": duration_ms,
        "cached_at": None,
    }
    
    # Cache non-keyed results
    if not req.user_api_keys:
        from datetime import datetime, timezone
        response_data["cached_at"] = datetime.now(timezone.utc)
        await cex_cache.set(cache_key, response_data, settings.CEX_CACHE_TTL)
    
    return ScanResponse(
        data=results,
        total=len(results),
        scanned_exchanges=scanned_exchanges,
        scanned_symbols=len(symbols_used),
        scan_duration_ms=duration_ms,
        cached=False,
    )


@router.get("/scan", response_model=ScanResponse)
async def scan_cex_spreads_get(
    min_spread: float = Query(default=0.5, ge=0.0, le=100.0, description="Minimum spread %"),
    min_volume: float = Query(default=50000.0, ge=0.0, description="Min 24h volume USD"),
    quote: str = Query(default="USDT", description="Quote currency"),
    limit: int = Query(default=50, ge=1, le=200),
    symbols: Optional[str] = Query(default=None, description="Comma-separated symbols, e.g. BTC/USDT,ETH/USDT"),
    exchanges: Optional[str] = Query(default=None, description="Comma-separated exchanges"),
):
    """GET version of scan endpoint for quick testing"""
    req = ScanRequest(
        symbols=[s.strip() for s in symbols.split(",")] if symbols else None,
        exchanges=[e.strip() for e in exchanges.split(",")] if exchanges else None,
        min_spread_pct=min_spread,
        min_volume_24h=min_volume,
        quote_currency=quote,
        limit=limit,
    )
    return await scan_cex_spreads(req)


@router.get("/exchanges")
async def get_supported_exchanges():
    """List all supported CEX exchanges"""
    return {
        "exchanges": [
            {
                "id": ex_id,
                "name": meta["name"],
                "color": meta["color"],
            }
            for ex_id, meta in EXCHANGE_META.items()
        ],
        "total": len(EXCHANGE_META),
    }


@router.get("/symbols")
async def get_default_symbols():
    """List default symbols scanned"""
    return {
        "symbols": settings.DEFAULT_SYMBOLS,
        "total": len(settings.DEFAULT_SYMBOLS),
    }
