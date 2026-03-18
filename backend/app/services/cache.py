"""
NEXARB Scanner - Cache Service
In-memory TTL cache to avoid hammering rate-limited APIs
"""
import time
import asyncio
import logging
from typing import Any, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    value: Any
    expires_at: float
    key: str


class TTLCache:
    """Thread-safe in-memory cache with TTL per entry"""

    def __init__(self, default_ttl: int = 30):
        self._store: dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()
        self.default_ttl = default_ttl
        self.hits = 0
        self.misses = 0

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self.misses += 1
                return None
            if time.time() > entry.expires_at:
                del self._store[key]
                self.misses += 1
                return None
            self.hits += 1
            return entry.value

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        async with self._lock:
            ttl = ttl or self.default_ttl
            self._store[key] = CacheEntry(
                value=value,
                expires_at=time.time() + ttl,
                key=key,
            )

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._store.pop(key, None)

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()

    async def cleanup_expired(self) -> int:
        """Remove expired entries, return count removed"""
        now = time.time()
        async with self._lock:
            expired_keys = [
                k for k, v in self._store.items()
                if now > v.expires_at
            ]
            for k in expired_keys:
                del self._store[k]
            return len(expired_keys)

    def stats(self) -> dict:
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100) if total > 0 else 0
        return {
            "entries": len(self._store),
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate_pct": round(hit_rate, 1),
        }


# ── Singleton cache instances ─────────────────────────────────────────────────

# CEX price data cache (30s TTL)
cex_cache = TTLCache(default_ttl=30)

# DEX price data cache (20s TTL)
dex_cache = TTLCache(default_ttl=20)

# Futures/funding cache (60s TTL)
futures_cache = TTLCache(default_ttl=60)

# Exchange ticker cache - per-exchange (30s)
ticker_cache = TTLCache(default_ttl=30)


def make_cex_key(exchanges: list, symbols: list, quote: str, min_spread: float) -> str:
    exch_str = "_".join(sorted(exchanges or []))
    sym_str = "_".join(sorted(symbols or []))
    return f"cex:{exch_str}:{sym_str}:{quote}:{min_spread}"


def make_futures_key(exchanges: list, symbols: list) -> str:
    exch_str = "_".join(sorted(exchanges or []))
    sym_str = "_".join(sorted(symbols or []))
    return f"futures:{exch_str}:{sym_str}"


def make_dex_key(tokens: list, chains: list, min_spread: float) -> str:
    tok_str = "_".join(sorted(tokens or []))
    chain_str = "_".join(sorted(chains or []))
    return f"dex:{tok_str}:{chain_str}:{min_spread}"


def make_ticker_key(exchange: str, symbol: str) -> str:
    return f"ticker:{exchange}:{symbol}"
