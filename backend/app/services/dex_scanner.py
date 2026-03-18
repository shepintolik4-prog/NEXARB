"""
NEXARB Scanner - DEX Scanner Service
Fetches DEX prices from DexScreener and Jupiter APIs
Finds cross-chain and cross-DEX arbitrage opportunities
"""
import asyncio
import httpx
import logging
import time
from typing import Optional
from datetime import datetime, timezone

from app.config import settings, CHAIN_META
from app.models import DexSpreadResult
from app.services.cache import dex_cache, make_dex_key

logger = logging.getLogger(__name__)

# ── DexScreener API ───────────────────────────────────────────────────────────

# Popular tokens to scan (symbol → DexScreener-compatible search term)
DEFAULT_DEX_TOKENS = [
    "BTC", "ETH", "BNB", "SOL", "AVAX", "MATIC", "ARB",
    "OP", "LINK", "UNI", "AAVE", "CRV", "GMX", "JUP",
    "WIF", "BONK", "PEPE", "SHIB", "FLOKI",
]

# Chain IDs used by DexScreener
DEXSCREENER_CHAINS = {
    "ethereum": "ethereum",
    "bsc": "bsc",
    "polygon": "polygon",
    "arbitrum": "arbitrum",
    "base": "base",
    "solana": "solana",
    "avalanche": "avalanche",
    "ton": "ton",
}


async def search_token_pairs(
    token_symbol: str,
    client: httpx.AsyncClient,
) -> list[dict]:
    """
    Search DexScreener for all pairs of a token across chains.
    Returns list of pair objects.
    """
    try:
        url = f"{settings.DEXSCREENER_BASE_URL}/dex/search?q={token_symbol}"
        response = await client.get(url, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        return data.get("pairs") or []
    except Exception as e:
        logger.debug(f"DexScreener search error for {token_symbol}: {e}")
        return []


async def get_token_pairs_by_address(
    token_address: str,
    chain: str,
    client: httpx.AsyncClient,
) -> list[dict]:
    """Get pairs for a specific token address on a chain"""
    try:
        url = f"{settings.DEXSCREENER_BASE_URL}/dex/tokens/{token_address}"
        response = await client.get(url, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        return data.get("pairs") or []
    except Exception as e:
        logger.debug(f"DexScreener address lookup error: {e}")
        return []


def parse_dexscreener_pair(pair: dict) -> Optional[dict]:
    """Extract relevant fields from a DexScreener pair object"""
    try:
        price_usd = float(pair.get("priceUsd") or 0)
        if price_usd <= 0:
            return None
        
        volume_24h = float(pair.get("volume", {}).get("h24") or 0)
        liquidity_usd = float(pair.get("liquidity", {}).get("usd") or 0)
        
        return {
            "chain": pair.get("chainId", "unknown"),
            "dex": pair.get("dexId", "unknown"),
            "base_token": pair.get("baseToken", {}).get("symbol", ""),
            "quote_token": pair.get("quoteToken", {}).get("symbol", ""),
            "pair_address": pair.get("pairAddress", ""),
            "price_usd": price_usd,
            "price_native": float(pair.get("priceNative") or 0),
            "volume_24h": volume_24h,
            "liquidity_usd": liquidity_usd,
            "txns_24h": (
                pair.get("txns", {}).get("h24", {}).get("buys", 0) +
                pair.get("txns", {}).get("h24", {}).get("sells", 0)
            ),
            "price_change_24h": float(pair.get("priceChange", {}).get("h24") or 0),
            "fdv": float(pair.get("fdv") or 0),
        }
    except (ValueError, TypeError, KeyError):
        return None


def find_dex_spreads(
    pairs: list[dict],
    token_symbol: str,
    min_spread_pct: float = 1.0,
    min_liquidity_usd: float = 10_000.0,
) -> list[DexSpreadResult]:
    """
    Given multiple pairs for the same token across chains/DEXs,
    find arbitrage opportunities.
    """
    if len(pairs) < 2:
        return []
    
    # Filter by liquidity
    liquid_pairs = [
        p for p in pairs
        if p["liquidity_usd"] >= min_liquidity_usd
        and p["price_usd"] > 0
        # Only compare USDT/USDC/USD quote pairs for clean comparison
        and p["quote_token"] in ("USDT", "USDC", "USD", "BUSD", "DAI")
    ]
    
    if len(liquid_pairs) < 2:
        return []
    
    spreads = []
    
    for i in range(len(liquid_pairs)):
        for j in range(len(liquid_pairs)):
            if i == j:
                continue
            
            buy_pair = liquid_pairs[i]   # lower price - buy here
            sell_pair = liquid_pairs[j]  # higher price - sell here
            
            buy_price = buy_pair["price_usd"]
            sell_price = sell_pair["price_usd"]
            
            if buy_price >= sell_price:
                continue
            
            spread_pct = (sell_price - buy_price) / buy_price * 100
            
            if spread_pct < min_spread_pct:
                continue
            
            # Avoid dust spreads from same DEX different pools
            if (buy_pair["chain"] == sell_pair["chain"] and
                    buy_pair["dex"] == sell_pair["dex"]):
                continue
            
            spreads.append(DexSpreadResult(
                symbol=f"{token_symbol}/USD",
                base_token=token_symbol,
                quote_token="USD",
                chain_buy=buy_pair["chain"],
                chain_sell=sell_pair["chain"],
                dex_buy=buy_pair["dex"],
                dex_sell=sell_pair["dex"],
                price_buy=buy_price,
                price_sell=sell_price,
                spread_pct=round(spread_pct, 4),
                liquidity_buy=round(buy_pair["liquidity_usd"], 2),
                liquidity_sell=round(sell_pair["liquidity_usd"], 2),
                volume_24h_buy=round(buy_pair["volume_24h"], 2),
                volume_24h_sell=round(sell_pair["volume_24h"], 2),
                pool_address_buy=buy_pair["pair_address"],
                pool_address_sell=sell_pair["pair_address"],
                scanned_at=datetime.now(timezone.utc),
            ))
    
    spreads.sort(key=lambda x: x.spread_pct, reverse=True)
    
    # Deduplicate: keep only best spread per chain_buy/chain_sell combo
    seen = set()
    deduped = []
    for s in spreads:
        key = (s.base_token, s.chain_buy, s.chain_sell)
        if key not in seen:
            seen.add(key)
            deduped.append(s)
    
    return deduped


# ── Jupiter API (Solana) ──────────────────────────────────────────────────────

# Well-known Solana token addresses
SOLANA_TOKENS = {
    "SOL": "So11111111111111111111111111111111111111112",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "BTC": "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
    "ETH": "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "WIF": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
}


async def fetch_jupiter_prices(
    token_addresses: list[str],
    client: httpx.AsyncClient,
) -> dict[str, float]:
    """
    Fetch token prices in USD from Jupiter Price API v6.
    Returns {token_address: price_usd}
    """
    if not token_addresses:
        return {}
    
    try:
        ids = ",".join(token_addresses)
        url = f"{settings.JUPITER_BASE_URL}/price?ids={ids}&vsToken=USDC"
        response = await client.get(url, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        
        prices = {}
        for addr, info in (data.get("data") or {}).items():
            if info and info.get("price"):
                prices[addr] = float(info["price"])
        
        return prices
    except Exception as e:
        logger.debug(f"Jupiter price fetch error: {e}")
        return {}


# ── Main DEX scan ─────────────────────────────────────────────────────────────

async def run_dex_scan(
    tokens: list[str] = None,
    chains: list[str] = None,
    min_spread_pct: float = 1.0,
    min_liquidity_usd: float = 10_000.0,
    limit: int = 100,
) -> tuple[list[DexSpreadResult], list[str], float]:
    """
    Run full DEX arbitrage scan via DexScreener.
    Returns (results, chains_scanned, duration_ms)
    """
    start_time = time.time()
    
    tokens = tokens or DEFAULT_DEX_TOKENS
    
    # Check cache
    cache_key = make_dex_key(tokens, chains or [], min_spread_pct)
    cached = await dex_cache.get(cache_key)
    if cached:
        duration_ms = (time.time() - start_time) * 1000
        result_data, chains_scanned = cached
        return result_data, chains_scanned, round(duration_ms, 1)
    
    all_results: list[DexSpreadResult] = []
    chains_found = set()
    
    async with httpx.AsyncClient(
        headers={"User-Agent": "NEXARBScanner/1.0"},
        timeout=15.0,
    ) as client:
        # Semaphore to avoid hammering DexScreener
        sem = asyncio.Semaphore(5)
        
        async def scan_token(token: str):
            async with sem:
                pairs_raw = await search_token_pairs(token, client)
                pairs = [p for p in [parse_dexscreener_pair(pr) for pr in pairs_raw] if p]
                
                # Filter by chain if specified
                if chains:
                    pairs = [p for p in pairs if p["chain"] in chains]
                
                # Track chains
                for p in pairs:
                    chains_found.add(p["chain"])
                
                return find_dex_spreads(pairs, token, min_spread_pct, min_liquidity_usd)
        
        token_tasks = [scan_token(t) for t in tokens]
        token_results = await asyncio.gather(*token_tasks, return_exceptions=True)
        
        for spreads in token_results:
            if isinstance(spreads, Exception) or not spreads:
                continue
            all_results.extend(spreads)
    
    # Sort by spread %
    all_results.sort(key=lambda x: x.spread_pct, reverse=True)
    all_results = all_results[:limit]
    
    chains_scanned = sorted(list(chains_found))
    
    # Cache results
    await dex_cache.set(cache_key, (all_results, chains_scanned), settings.DEX_CACHE_TTL)
    
    duration_ms = (time.time() - start_time) * 1000
    return all_results, chains_scanned, round(duration_ms, 1)
