"""
NEXARB Scanner - Alerts Router
CRUD endpoints for user alert management
"""
from fastapi import APIRouter, HTTPException, Header
from typing import Optional, List

from app.models import AlertCreate, AlertUpdate, AlertResponse
from app.database import get_supabase_service

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


def _get_db():
    return get_supabase_service()


@router.post("/", response_model=AlertResponse)
async def create_alert(req: AlertCreate, x_telegram_id: Optional[int] = Header(None)):
    """Create a new alert for a user"""
    telegram_id = req.telegram_id or x_telegram_id
    if not telegram_id:
        raise HTTPException(status_code=400, detail="telegram_id required")

    db = _get_db()

    # Check if user exists
    user = db.table("users").select("id").eq("telegram_id", telegram_id).execute()
    if not user.data:
        # Auto-create user
        db.table("users").insert({"telegram_id": telegram_id}).execute()
        user = db.table("users").select("id").eq("telegram_id", telegram_id).execute()

    user_id = user.data[0]["id"] if user.data else None

    result = db.table("alerts").insert({
        "user_id": user_id,
        "telegram_id": telegram_id,
        "alert_type": req.alert_type,
        "symbol": req.symbol,
        "exchange_buy": req.exchange_buy,
        "exchange_sell": req.exchange_sell,
        "min_spread_pct": req.min_spread_pct,
        "min_volume_24h": req.min_volume_24h,
        "max_funding_rate": req.max_funding_rate,
        "cooldown_minutes": req.cooldown_minutes,
        "is_active": True,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create alert")

    alert = result.data[0]
    return _format_alert(alert)


@router.get("/{telegram_id}", response_model=List[AlertResponse])
async def get_user_alerts(telegram_id: int):
    """Get all alerts for a user"""
    db = _get_db()
    result = (
        db.table("alerts")
        .select("*")
        .eq("telegram_id", telegram_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [_format_alert(a) for a in (result.data or [])]


@router.patch("/{alert_id}")
async def update_alert(alert_id: str, req: AlertUpdate):
    """Update an existing alert"""
    db = _get_db()

    # Verify ownership
    existing = (
        db.table("alerts")
        .select("telegram_id")
        .eq("id", alert_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    if existing.data[0]["telegram_id"] != req.telegram_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = {}
    if req.is_active is not None:
        update_data["is_active"] = req.is_active
    if req.min_spread_pct is not None:
        update_data["min_spread_pct"] = req.min_spread_pct
    if req.min_volume_24h is not None:
        update_data["min_volume_24h"] = req.min_volume_24h
    if req.cooldown_minutes is not None:
        update_data["cooldown_minutes"] = req.cooldown_minutes

    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")

    result = db.table("alerts").update(update_data).eq("id", alert_id).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Update failed")

    return _format_alert(result.data[0])


@router.delete("/{alert_id}")
async def delete_alert(alert_id: str, telegram_id: int):
    """Delete an alert"""
    db = _get_db()

    existing = (
        db.table("alerts")
        .select("telegram_id")
        .eq("id", alert_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    if existing.data[0]["telegram_id"] != telegram_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.table("alerts").delete().eq("id", alert_id).execute()

    return {"success": True, "message": "Alert deleted"}


@router.get("/{alert_id}/history")
async def get_alert_history(alert_id: str, telegram_id: int, limit: int = 20):
    """Get trigger history for an alert"""
    db = _get_db()

    # Verify ownership
    existing = (
        db.table("alerts")
        .select("telegram_id")
        .eq("id", alert_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    if existing.data[0]["telegram_id"] != telegram_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    result = (
        db.table("alert_history")
        .select("*")
        .eq("alert_id", alert_id)
        .order("sent_at", desc=True)
        .limit(limit)
        .execute()
    )

    return {"data": result.data or [], "total": len(result.data or [])}


def _format_alert(alert: dict) -> AlertResponse:
    """Convert DB row to AlertResponse"""
    from app.models import AlertType
    from datetime import datetime

    created_at = alert.get("created_at")
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))

    last_triggered = alert.get("last_triggered_at")
    if isinstance(last_triggered, str):
        last_triggered = datetime.fromisoformat(last_triggered.replace("Z", "+00:00"))

    return AlertResponse(
        id=alert["id"],
        alert_type=AlertType(alert["alert_type"]),
        symbol=alert.get("symbol"),
        exchange_buy=alert.get("exchange_buy"),
        exchange_sell=alert.get("exchange_sell"),
        min_spread_pct=float(alert.get("min_spread_pct", 1.0)),
        min_volume_24h=float(alert.get("min_volume_24h", 100000.0)),
        is_active=alert.get("is_active", True),
        last_triggered_at=last_triggered,
        trigger_count=alert.get("trigger_count", 0),
        cooldown_minutes=alert.get("cooldown_minutes", 30),
        created_at=created_at,
    )
