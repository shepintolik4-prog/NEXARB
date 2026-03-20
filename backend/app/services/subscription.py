"""
NEXARB Scanner v2 - Subscription Service
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from app.database import get_supabase_service

logger = logging.getLogger(__name__)

FREE_LIMITS = {"max_exchanges": 5, "max_symbols": 10, "max_alerts": 3,
               "scan_delay_sec": 60, "modules": ["cex"], "max_trades_per_day": 0}
VIP_LIMITS  = {"max_exchanges": 999, "max_symbols": 999, "max_alerts": 999,
               "scan_delay_sec": 0, "modules": ["cex","futures","dex","alerts","trading"], "max_trades_per_day": 50}
FREE_EXCHANGES = ["binance","okx","bybit","kucoin","gateio"]
FREE_SYMBOLS   = ["BTC/USDT","ETH/USDT","BNB/USDT","XRP/USDT","SOL/USDT",
                  "DOGE/USDT","AVAX/USDT","LINK/USDT","LTC/USDT","TON/USDT"]


async def get_user_tier(telegram_id: int) -> dict:
    try:
        db = get_supabase_service()
        result = db.table("users").select(
            "telegram_id,vip_expires_at,referral_code,custom_exchanges,custom_symbols,trading_enabled"
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
        points_result = db.table("referral_points").select("*").eq("telegram_id", telegram_id).execute()
        points = points_result.data[0] if points_result.data else {"total_points": 0, "available_points": 0}
        return {"is_vip": is_vip, "expires_at": vip_expires.isoformat() if vip_expires else None,
                "limits": limits, "referral_code": user.get("referral_code"),
                "custom_exchanges": user.get("custom_exchanges") or [],
                "custom_symbols": user.get("custom_symbols") or [],
                "trading_enabled": user.get("trading_enabled", False), "points": points}
    except Exception as e:
        logger.error(f"get_user_tier error: {e}")
        return {"is_vip": False, "limits": FREE_LIMITS}


async def activate_vip(telegram_id: int, plan: str, payment_id: str = None):
    from app.services.cryptobot import PLAN_DAYS
    days = PLAN_DAYS.get(plan, 30)
    db = get_supabase_service()
    result = db.rpc("add_vip_days", {"p_telegram_id": telegram_id, "p_days": days}).execute()
    new_expiry = result.data
    db.table("subscriptions").insert({"telegram_id": telegram_id, "plan": plan,
                                       "status": "active", "expires_at": new_expiry,
                                       "payment_id": payment_id}).execute()
    logger.info(f"VIP activated for {telegram_id}: plan={plan}")
    return new_expiry


async def check_module_access(telegram_id: int, module: str) -> bool:
    tier = await get_user_tier(telegram_id)
    return module in tier["limits"]["modules"]


async def get_subscription_status(telegram_id: int) -> dict:
    tier = await get_user_tier(telegram_id)
    db = get_supabase_service()
    payments = db.table("payments").select("plan,amount,currency,status,paid_at,created_at"
        ).eq("telegram_id", telegram_id).eq("status", "paid").order("paid_at", desc=True).limit(5).execute()
    return {"is_vip": tier["is_vip"], "expires_at": tier["expires_at"], "limits": tier["limits"],
            "points": tier["points"], "referral_code": tier["referral_code"],
            "payment_history": payments.data or []}