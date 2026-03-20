"""
NEXARB Scanner v2 - Subscriptions Router
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.subscription import get_user_tier, get_subscription_status
from app.database import get_supabase_service

router = APIRouter(prefix="/api/subscriptions", tags=["Subscriptions"])


@router.get("/{telegram_id}")
async def get_subscription(telegram_id: int):
    return await get_subscription_status(telegram_id)


@router.get("/{telegram_id}/tier")
async def get_tier(telegram_id: int):
    tier = await get_user_tier(telegram_id)
    return {
        "is_vip": tier["is_vip"],
        "expires_at": tier["expires_at"],
        "modules": tier["limits"]["modules"],
        "max_alerts": tier["limits"]["max_alerts"],
        "max_exchanges": tier["limits"]["max_exchanges"],
    }


class UpdatePreferencesRequest(BaseModel):
    telegram_id: int
    custom_exchanges: Optional[list] = None
    custom_symbols: Optional[list] = None


@router.post("/preferences")
async def update_preferences(req: UpdatePreferencesRequest):
    tier = await get_user_tier(req.telegram_id)
    if not tier["is_vip"]:
        raise HTTPException(status_code=403, detail="VIP subscription required")
    db = get_supabase_service()
    update_data = {}
    if req.custom_exchanges is not None:
        update_data["custom_exchanges"] = req.custom_exchanges
    if req.custom_symbols is not None:
        update_data["custom_symbols"] = req.custom_symbols
    db.table("users").update(update_data).eq("telegram_id", req.telegram_id).execute()
    return {"success": True}