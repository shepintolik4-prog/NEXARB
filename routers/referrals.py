"""
NEXARB Scanner v2 - Referrals Router
Referral links, points balance, convert to VIP days
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.database import get_supabase_service

router = APIRouter(prefix="/api/referrals", tags=["Referrals"])


class RegisterReferralRequest(BaseModel):
    referred_id: int
    referral_code: str


class ConvertPointsRequest(BaseModel):
    telegram_id: int
    points: int


@router.post("/register")
async def register_referral(req: RegisterReferralRequest):
    """
    Called when user opens bot with ?start=REF_CODE.
    Links referred user to referrer.
    """
    db = get_supabase_service()

    # Find referrer by code
    referrer = db.table("users").select("telegram_id").eq(
        "referral_code", req.referral_code.upper()
    ).execute()

    if not referrer.data:
        raise HTTPException(status_code=404, detail="Invalid referral code")

    referrer_id = referrer.data[0]["telegram_id"]

    # Don't self-refer
    if referrer_id == req.referred_id:
        raise HTTPException(status_code=400, detail="Cannot refer yourself")

    # Check if already referred
    existing = db.table("referrals").select("id").eq(
        "referred_id", req.referred_id
    ).execute()

    if existing.data:
        return {"success": True, "message": "Already registered"}

    # Create referral record
    db.table("referrals").insert({
        "referrer_id": referrer_id,
        "referred_id": req.referred_id,
    }).execute()

    # Update referred user's referred_by
    db.table("users").update({
        "referred_by": referrer_id
    }).eq("telegram_id", req.referred_id).execute()

    return {"success": True, "referrer_id": referrer_id}


@router.get("/{telegram_id}/stats")
async def get_referral_stats(telegram_id: int):
    """Get referral statistics and points balance"""
    db = get_supabase_service()

    # Get referral code
    user = db.table("users").select("referral_code").eq(
        "telegram_id", telegram_id
    ).execute()

    if not user.data:
        raise HTTPException(status_code=404, detail="User not found")

    referral_code = user.data[0].get("referral_code", "")

    # Get referrals list
    referrals = db.table("referrals").select("*").eq(
        "referrer_id", telegram_id
    ).execute()

    total_referrals = len(referrals.data or [])
    converted = sum(1 for r in (referrals.data or []) if r.get("converted"))
    total_points_earned = sum(r.get("points_earned", 0) for r in (referrals.data or []))

    # Get points balance
    points_row = db.table("referral_points").select("*").eq(
        "telegram_id", telegram_id
    ).execute()

    points = points_row.data[0] if points_row.data else {
        "total_points": 0,
        "spent_points": 0,
        "available_points": 0,
    }

    # Generate bot deep link
    from app.config import settings
    bot_username = "nexarb_bot"  # replace with actual bot username
    ref_link = f"https://t.me/{bot_username}?start={referral_code}"

    return {
        "referral_code": referral_code,
        "ref_link": ref_link,
        "total_referrals": total_referrals,
        "converted_referrals": converted,
        "conversion_rate": round(converted / total_referrals * 100, 1) if total_referrals else 0,
        "total_points_earned": total_points_earned,
        "points_balance": points.get("available_points", 0),
        "total_points": points.get("total_points", 0),
        "spent_points": points.get("spent_points", 0),
        "points_to_days_rate": "100 points = 1 day VIP",
        "recent_referrals": (referrals.data or [])[-5:],
    }


@router.post("/convert-points")
async def convert_points(req: ConvertPointsRequest):
    """Convert referral points to VIP days (100 points = 1 day)"""
    if req.points < 100:
        raise HTTPException(status_code=400, detail="Minimum 100 points required")

    db = get_supabase_service()
    result = db.rpc("convert_points_to_vip", {
        "p_telegram_id": req.telegram_id,
        "p_points": req.points,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Conversion failed")

    data = result.data
    if not data.get("success"):
        raise HTTPException(status_code=400, detail=data.get("error", "Conversion failed"))

    # Notify user
    try:
        from app.services.telegram_bot import get_bot
        from telegram.constants import ParseMode
        bot = get_bot()
        await bot.send_message(
            chat_id=req.telegram_id,
            text=(
                f"✅ <b>Points Converted!</b>\n\n"
                f"Spent: <b>{req.points} points</b>\n"
                f"Added: <b>+{data['days_added']} days VIP</b>\n"
                f"VIP expires: <code>{data.get('vip_expires_at', 'N/A')[:10]}</code>"
            ),
            parse_mode=ParseMode.HTML,
        )
    except Exception:
        pass

    return data
