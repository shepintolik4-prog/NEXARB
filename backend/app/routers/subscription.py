"""
NEXARB Scanner v2 - Subscription Service
VIP tier checking, limits enforcement, plan management
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from functools import wraps

from fastapi import HTTPException, Header
from app.database import get_supabase_service

logger = logging.getLogger(__name__)

# ── Tier limits ────────────────────────────────────────────────────────────────

FREE_LIMITS = {
    "max_exchanges": 5,
    "max_symbols": 10,
    "max_alerts": 3,
    "scan_delay_sec": 60,       # results cached/delayed
    "modules": ["cex"],         # only CEX scanner
    "max_trades_per_day": 0,    # no auto-trading
}

VIP_LIMITS = {
    "max_exchanges": 999,
    "max_symbols": 999,
    "max_alerts": 999,
    "scan_delay_sec": 0,        # realtime
    "modules": ["cex", "futures", "dex", "alerts", "trading"],
    "max_trades_per_day": 50,
}

FREE_EXCHANGES = ["binance", "okx", "bybit", "kucoin", "gateio"]
FREE_SYMBOLS = [
    "BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT", "SOL/USDT",
    "DOGE/USDT", "AVAX/USDT", "LINK/USDT", "LTC/USDT", "TON/USDT",
]


async def get_user_tier(telegram_id: int) -> dict:
    """
    Returns user tier info:
    {is_vip, expires_at, limits, referral_code, points}
    """
    try:
        db = get_supabase_service()
        result = db.table("users").select(
            "telegram_id, vip_expires_at, referral_code, custom_exchanges, custom_symbols, trading_enabled"
        ).eq("telegram_id", telegram_id).execute()

        if not result.data:
            return {"is_vip": False, "limits": FREE_LIMITS}

        user = result.data[0]
        vip_expires = user.get("vip_expires_at")

        is_vip = False
        if vip_expires:
            if isinstance(vip_expires, str):
                vip_expires = datetime.fromisoformat(vip_expires.replace("Z", "+00:00"))
            is_vip = vip_expires > datetime.now(timezone.utc)

        limits = VIP_LIMITS.copy() if is_vip else FREE_LIMITS.copy()

        # Get referral points
        points_result = db.table("referral_points").select("*").eq(
            "telegram_id", telegram_id
        ).execute()
        points = points_result.data[0] if points_result.data else {"total_points": 0, "available_points": 0}

        return {
            "is_vip": is_vip,
            "expires_at": vip_expires.isoformat() if vip_expires else None,
            "limits": limits,
            "referral_code": user.get("referral_code"),
            "custom_exchanges": user.get("custom_exchanges") or [],
            "custom_symbols": user.get("custom_symbols") or [],
            "trading_enabled": user.get("trading_enabled", False),
            "points": points,
        }
    except Exception as e:
        logger.error(f"get_user_tier error: {e}")
        return {"is_vip": False, "limits": FREE_LIMITS}


def apply_free_limits(params: dict, tier: dict) -> dict:
    """
    Apply Free tier restrictions to scan params.
    VIP users get their custom settings.
    """
    is_vip = tier.get("is_vip", False)

    if is_vip:
        # VIP: use custom settings if set, otherwise defaults
        custom_exchanges = tier.get("custom_exchanges") or []
        custom_symbols = tier.get("custom_symbols") or []
        if custom_exchanges:
            params["exchanges"] = custom_exchanges
        if custom_symbols:
            params["symbols"] = custom_symbols
    else:
        # Free: hard limits
        params["exchanges"] = FREE_EXCHANGES
        params["symbols"] = FREE_SYMBOLS
        if params.get("limit", 50) > 20:
            params["limit"] = 20

    return params


async def activate_vip(telegram_id: int, plan: str, payment_id: str = None) -> datetime:
    """Activate VIP subscription for user"""
    from app.services.cryptobot import PLAN_DAYS
    days = PLAN_DAYS.get(plan, 30)

    db = get_supabase_service()

    # Call DB function to add VIP days
    result = db.rpc("add_vip_days", {
        "p_telegram_id": telegram_id,
        "p_days": days,
    }).execute()

    new_expiry = result.data

    # Create subscription record
    db.table("subscriptions").insert({
        "telegram_id": telegram_id,
        "plan": plan,
        "status": "active",
        "expires_at": new_expiry,
        "payment_id": payment_id,
    }).execute()

    logger.info(f"VIP activated for {telegram_id}: plan={plan}, expires={new_expiry}")
    return new_expiry


async def check_module_access(telegram_id: int, module: str) -> bool:
    """Check if user can access a specific module"""
    tier = await get_user_tier(telegram_id)
    return module in tier["limits"]["modules"]


async def get_subscription_status(telegram_id: int) -> dict:
    """Full subscription status for Settings page"""
    tier = await get_user_tier(telegram_id)

    # Get payment history
    db = get_supabase_service()
    payments = db.table("payments").select(
        "plan, amount, currency, status, paid_at, created_at"
    ).eq("telegram_id", telegram_id).eq("status", "paid").order(
        "paid_at", desc=True
    ).limit(5).execute()

    return {
        "is_vip": tier["is_vip"],
        "expires_at": tier["expires_at"],
        "limits": tier["limits"],
        "points": tier["points"],
        "referral_code": tier["referral_code"],
        "payment_history": payments.data or [],
    }
