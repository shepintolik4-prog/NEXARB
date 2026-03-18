"""
NEXARB Scanner - Database
Supabase client initialization and helper functions
"""
from supabase import create_client, Client
from app.config import settings
import logging

logger = logging.getLogger(__name__)

_supabase_client: Client | None = None
_supabase_service_client: Client | None = None


def get_supabase() -> Client:
    """Get anon Supabase client (respects RLS)"""
    global _supabase_client
    if _supabase_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY,
        )
    return _supabase_client


def get_supabase_service() -> Client:
    """Get service role client (bypasses RLS - use only in background jobs)"""
    global _supabase_service_client
    if _supabase_service_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _supabase_service_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY,
        )
    return _supabase_service_client


async def upsert_user(telegram_id: int, username: str = None,
                      first_name: str = None, last_name: str = None) -> dict:
    """Register or update a Telegram user"""
    db = get_supabase_service()
    result = db.table("users").upsert(
        {
            "telegram_id": telegram_id,
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
        },
        on_conflict="telegram_id",
    ).execute()
    return result.data[0] if result.data else {}


async def get_user_by_telegram_id(telegram_id: int) -> dict | None:
    db = get_supabase_service()
    result = db.table("users").select("*").eq("telegram_id", telegram_id).execute()
    return result.data[0] if result.data else None


async def save_spread_snapshots(snapshots: list[dict]) -> None:
    """Bulk insert spread snapshots (background job)"""
    if not snapshots:
        return
    db = get_supabase_service()
    try:
        db.table("spread_snapshots").insert(snapshots).execute()
    except Exception as e:
        logger.error(f"Error saving snapshots: {e}")


async def get_latest_snapshots(snapshot_type: str, limit: int = 100,
                               min_spread: float = 0.3) -> list[dict]:
    """Get latest scan results from DB"""
    db = get_supabase_service()
    result = (
        db.table("spread_snapshots")
        .select("*")
        .eq("snapshot_type", snapshot_type)
        .gte("spread_pct", min_spread)
        .order("scanned_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


async def get_active_alerts() -> list[dict]:
    """Get all active alerts for background checker"""
    db = get_supabase_service()
    result = (
        db.table("alerts")
        .select("*")
        .eq("is_active", True)
        .execute()
    )
    return result.data or []


async def update_alert_triggered(alert_id: str) -> None:
    """Update alert last triggered time and count"""
    from datetime import datetime, timezone
    db = get_supabase_service()
    db.table("alerts").update({
        "last_triggered_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", alert_id).execute()
    # Increment trigger_count
    db.rpc("increment_alert_count", {"alert_id": alert_id}).execute()


async def log_alert_history(alert_id: str, telegram_id: int,
                             message: str, spread_data: dict) -> None:
    db = get_supabase_service()
    try:
        db.table("alert_history").insert({
            "alert_id": alert_id,
            "telegram_id": telegram_id,
            "message_text": message,
            "spread_data": spread_data,
        }).execute()
    except Exception as e:
        logger.error(f"Error logging alert history: {e}")


async def cleanup_old_snapshots() -> None:
    """Delete snapshots older than 5 minutes (called by scheduler)"""
    db = get_supabase_service()
    try:
        db.rpc("cleanup_old_snapshots").execute()
    except Exception:
        # Fallback: raw delete
        from datetime import datetime, timezone, timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        db.table("spread_snapshots").delete().lt("scanned_at", cutoff).execute()
