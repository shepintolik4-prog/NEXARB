"""
NEXARB Scanner - Users Router
User registration and API key management
"""
import hmac
import hashlib
import json
import time
from fastapi import APIRouter, HTTPException
from typing import Optional

from app.models import TelegramUserInit, UserApiKeysUpdate, UserResponse
from app.database import upsert_user, get_user_by_telegram_id, get_supabase_service
from app.config import settings

router = APIRouter(prefix="/api/users", tags=["Users"])


def validate_telegram_init_data(init_data: str) -> dict | None:
    """
    Validate Telegram WebApp initData signature.
    Returns parsed data dict if valid, None if invalid.
    """
    if not settings.TELEGRAM_BOT_TOKEN:
        # Dev mode: skip validation
        return {}

    try:
        params = {}
        for part in init_data.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                params[k] = v

        received_hash = params.pop("hash", None)
        if not received_hash:
            return None

        # Build check string (sorted key=value pairs)
        check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(params.items())
        )

        # HMAC-SHA256 with key = HMAC-SHA256("WebAppData", bot_token)
        secret_key = hmac.new(
            b"WebAppData",
            settings.TELEGRAM_BOT_TOKEN.encode(),
            hashlib.sha256,
        ).digest()

        computed_hash = hmac.new(
            secret_key,
            check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(computed_hash, received_hash):
            return None

        # Check timestamp (reject if older than 1 hour)
        auth_date = int(params.get("auth_date", 0))
        if time.time() - auth_date > 3600:
            return None

        return params

    except Exception:
        return None


@router.post("/init", response_model=UserResponse)
async def init_user(req: TelegramUserInit):
    """
    Called when TMA opens. Validates Telegram data and registers/updates user.
    """
    # Validate initData (skip in debug mode)
    if not settings.DEBUG:
        valid = validate_telegram_init_data(req.init_data)
        if valid is None:
            raise HTTPException(status_code=401, detail="Invalid Telegram initData")

    # Upsert user in DB
    await upsert_user(
        telegram_id=req.telegram_id,
        username=req.username,
        first_name=req.first_name,
        last_name=req.last_name,
    )

    # Fetch full user data
    user = await get_user_by_telegram_id(req.telegram_id)
    if not user:
        raise HTTPException(status_code=500, detail="Failed to create user")

    return _format_user(user)


@router.get("/{telegram_id}", response_model=UserResponse)
async def get_user(telegram_id: int):
    """Get user profile"""
    user = await get_user_by_telegram_id(telegram_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _format_user(user)


@router.post("/api-keys")
async def update_api_keys(req: UserApiKeysUpdate):
    """
    Store user API keys for enhanced scanning.
    Keys are stored as-is (consider encrypting in production).
    """
    db = get_supabase_service()
    
    update_data = {}
    exchange = req.exchange.lower()
    
    if exchange == "binance":
        update_data["binance_api_key"] = req.api_key
        update_data["binance_api_secret"] = req.api_secret
    elif exchange == "okx":
        update_data["okx_api_key"] = req.api_key
        update_data["okx_api_secret"] = req.api_secret
        if req.passphrase:
            update_data["okx_passphrase"] = req.passphrase
    elif exchange == "bybit":
        update_data["bybit_api_key"] = req.api_key
        update_data["bybit_api_secret"] = req.api_secret
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Exchange {exchange} not supported for API key storage"
        )

    result = (
        db.table("users")
        .update(update_data)
        .eq("telegram_id", req.telegram_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")

    return {"success": True, "exchange": exchange, "message": "API keys saved"}


@router.delete("/{telegram_id}/api-keys/{exchange}")
async def delete_api_keys(telegram_id: int, exchange: str):
    """Remove stored API keys for an exchange"""
    db = get_supabase_service()

    update_data = {}
    exchange = exchange.lower()

    if exchange == "binance":
        update_data = {"binance_api_key": None, "binance_api_secret": None}
    elif exchange == "okx":
        update_data = {"okx_api_key": None, "okx_api_secret": None, "okx_passphrase": None}
    elif exchange == "bybit":
        update_data = {"bybit_api_key": None, "bybit_api_secret": None}
    else:
        raise HTTPException(status_code=400, detail="Exchange not supported")

    db.table("users").update(update_data).eq("telegram_id", telegram_id).execute()
    return {"success": True, "message": f"{exchange} API keys removed"}


@router.patch("/{telegram_id}/preferences")
async def update_preferences(
    telegram_id: int,
    notifications_enabled: Optional[bool] = None,
    preferred_quote: Optional[str] = None,
):
    """Update user preferences"""
    db = get_supabase_service()

    update_data = {}
    if notifications_enabled is not None:
        update_data["notifications_enabled"] = notifications_enabled
    if preferred_quote is not None:
        update_data["preferred_quote"] = preferred_quote.upper()

    if not update_data:
        raise HTTPException(status_code=400, detail="No preferences to update")

    db.table("users").update(update_data).eq("telegram_id", telegram_id).execute()
    return {"success": True}


def _format_user(user: dict) -> UserResponse:
    from datetime import datetime
    created = user.get("created_at")
    if isinstance(created, str):
        created = datetime.fromisoformat(created.replace("Z", "+00:00"))

    return UserResponse(
        telegram_id=user["telegram_id"],
        username=user.get("username"),
        first_name=user.get("first_name"),
        has_binance_key=bool(user.get("binance_api_key")),
        has_okx_key=bool(user.get("okx_api_key")),
        has_bybit_key=bool(user.get("bybit_api_key")),
        preferred_quote=user.get("preferred_quote", "USDT"),
        notifications_enabled=user.get("notifications_enabled", True),
        created_at=created,
    )
