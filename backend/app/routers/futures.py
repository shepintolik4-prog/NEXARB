"""
NEXARB Scanner - Futures Scanner Router
Spot-futures spreads and funding rate endpoints
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.models import FuturesScanRequest, FuturesScanResponse
from app.services.futures_scanner import (
    run_futures_scan, run_funding_rates_scan, FUTURES_EXCHANGES
)

router = APIRouter(prefix="/api/futures", tags=["Futures Scanner"])


@router.post("/scan", response_model=FuturesScanResponse)
async def scan_futures_spreads(req: FuturesScanRequest):
    """
    Scan spot vs perpetual futures spreads.
    Useful for identifying funding arbitrage opportunities.
    """
    try:
        results, duration_ms = await run_futures_scan(
            symbols=req.symbols,
            exchanges=req.exchanges,
            min_spread_pct=req.min_spread_pct,
            include_funding=req.include_funding,
            limit=req.limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Futures scan failed: {str(e)}")

    return FuturesScanResponse(
        data=results,
        total=len(results),
        scan_duration_ms=duration_ms,
        cached=False,
    )


@router.get("/scan", response_model=FuturesScanResponse)
async def scan_futures_spreads_get(
    min_spread: float = Query(default=0.3, ge=0.0, le=100.0),
    limit: int = Query(default=50, ge=1, le=200),
    symbols: Optional[str] = Query(default=None),
    exchanges: Optional[str] = Query(default=None),
):
    """GET version of futures scan"""
    req = FuturesScanRequest(
        symbols=[s.strip() for s in symbols.split(",")] if symbols else None,
        exchanges=[e.strip() for e in exchanges.split(",")] if exchanges else None,
        min_spread_pct=min_spread,
        limit=limit,
    )
    return await scan_futures_spreads(req)


@router.get("/funding-rates")
async def get_funding_rates(
    exchanges: Optional[str] = Query(default=None, description="Comma-separated exchanges"),
    symbols: Optional[str] = Query(default=None, description="Comma-separated symbols"),
    limit: int = Query(default=50, ge=1, le=200),
):
    """
    Get current funding rates across exchanges.
    Sorted by absolute rate (highest first = best opportunities).
    """
    try:
        results = await run_funding_rates_scan(
            exchanges=[e.strip() for e in exchanges.split(",")] if exchanges else None,
            symbols=[s.strip() for s in symbols.split(",")] if symbols else None,
        )
        return {
            "success": True,
            "data": results[:limit],
            "total": len(results),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Funding rate scan failed: {str(e)}")


@router.get("/supported-exchanges")
async def get_futures_exchanges():
    """List exchanges that support futures scanning"""
    return {
        "exchanges": list(FUTURES_EXCHANGES.keys()),
        "total": len(FUTURES_EXCHANGES),
    }
