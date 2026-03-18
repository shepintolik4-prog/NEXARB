"""
NEXARB Scanner - DEX Scanner Router
Cross-chain DEX arbitrage endpoints
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.models import DexScanRequest, DexScanResponse
from app.services.dex_scanner import run_dex_scan, DEFAULT_DEX_TOKENS
from app.config import CHAIN_META

router = APIRouter(prefix="/api/dex", tags=["DEX Scanner"])


@router.post("/scan", response_model=DexScanResponse)
async def scan_dex_spreads(req: DexScanRequest):
    """
    Scan for cross-chain DEX arbitrage opportunities via DexScreener.
    """
    try:
        results, chains_scanned, duration_ms = await run_dex_scan(
            tokens=req.tokens,
            chains=req.chains,
            min_spread_pct=req.min_spread_pct,
            min_liquidity_usd=req.min_liquidity_usd,
            limit=req.limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DEX scan failed: {str(e)}")

    return DexScanResponse(
        data=results,
        total=len(results),
        chains_scanned=chains_scanned,
        cached=False,
    )


@router.get("/scan", response_model=DexScanResponse)
async def scan_dex_spreads_get(
    min_spread: float = Query(default=1.0, ge=0.0, le=100.0),
    min_liquidity: float = Query(default=10000.0, ge=0.0),
    limit: int = Query(default=50, ge=1, le=200),
    tokens: Optional[str] = Query(default=None, description="Comma-separated token symbols"),
    chains: Optional[str] = Query(default=None, description="Comma-separated chain IDs"),
):
    """GET version of DEX scan"""
    req = DexScanRequest(
        tokens=[t.strip() for t in tokens.split(",")] if tokens else None,
        chains=[c.strip() for c in chains.split(",")] if chains else None,
        min_spread_pct=min_spread,
        min_liquidity_usd=min_liquidity,
        limit=limit,
    )
    return await scan_dex_spreads(req)


@router.get("/chains")
async def get_supported_chains():
    """List all supported blockchain networks"""
    return {
        "chains": [
            {
                "id": chain_id,
                "name": meta["name"],
                "color": meta["color"],
                "native_symbol": meta["symbol"],
            }
            for chain_id, meta in CHAIN_META.items()
        ],
        "total": len(CHAIN_META),
    }


@router.get("/tokens")
async def get_default_tokens():
    """List default tokens scanned on DEXes"""
    return {
        "tokens": DEFAULT_DEX_TOKENS,
        "total": len(DEFAULT_DEX_TOKENS),
    }
