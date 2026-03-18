"""
NEXARB Scanner - Background Scheduler
APScheduler tasks for periodic scanning and cache management
"""
import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.services.cache import cex_cache, dex_cache, futures_cache, ticker_cache
from app.services.alert_engine import get_alert_engine
from app.database import cleanup_old_snapshots

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def job_cleanup_caches():
    """Periodically remove expired cache entries"""
    removed = 0
    removed += await cex_cache.cleanup_expired()
    removed += await dex_cache.cleanup_expired()
    removed += await futures_cache.cleanup_expired()
    removed += await ticker_cache.cleanup_expired()
    if removed:
        logger.debug(f"Cache cleanup: removed {removed} expired entries")


async def job_cleanup_db_snapshots():
    """Cleanup old spread snapshots from Supabase"""
    try:
        await cleanup_old_snapshots()
    except Exception as e:
        logger.error(f"DB snapshot cleanup error: {e}")


async def job_run_alert_cycle():
    """Trigger one alert engine cycle"""
    try:
        engine = get_alert_engine()
        await engine._run_cycle()
    except Exception as e:
        logger.error(f"Alert cycle error: {e}", exc_info=True)


def create_scheduler() -> AsyncIOScheduler:
    """Create and configure the scheduler"""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    scheduler = AsyncIOScheduler(timezone="UTC")

    # Cache cleanup every 2 minutes
    scheduler.add_job(
        job_cleanup_caches,
        trigger=IntervalTrigger(minutes=2),
        id="cache_cleanup",
        name="Cache Cleanup",
        replace_existing=True,
        misfire_grace_time=30,
    )

    # DB snapshot cleanup every 5 minutes
    scheduler.add_job(
        job_cleanup_db_snapshots,
        trigger=IntervalTrigger(minutes=5),
        id="db_cleanup",
        name="DB Snapshot Cleanup",
        replace_existing=True,
        misfire_grace_time=60,
    )

    # Alert engine check every 30 seconds
    scheduler.add_job(
        job_run_alert_cycle,
        trigger=IntervalTrigger(seconds=settings.ALERT_CHECK_INTERVAL_SEC),
        id="alert_check",
        name="Alert Engine Cycle",
        replace_existing=True,
        misfire_grace_time=10,
    )

    _scheduler = scheduler
    return scheduler


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler or create_scheduler()
