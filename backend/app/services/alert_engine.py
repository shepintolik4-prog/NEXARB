"""
NEXARB Scanner - Alert Engine
Background task that checks active alerts against live scan data
and sends notifications via Telegram
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.config import settings
from app.database import (
    get_active_alerts, update_alert_triggered,
    log_alert_history, save_spread_snapshots
)
from app.services.cex_scanner import run_cex_scan
from app.services.futures_scanner import run_futures_scan, run_funding_rates_scan
from app.services.dex_scanner import run_dex_scan
from app.services.telegram_bot import send_alert_notification
from app.models import SpreadResult, FuturesSpreadResult, DexSpreadResult

logger = logging.getLogger(__name__)


class AlertEngine:
    """
    Continuously checks active user alerts against live market data.
    Runs as a background task.
    """

    def __init__(self):
        self._running = False
        self._last_cex_results: list[SpreadResult] = []
        self._last_futures_results: list[FuturesSpreadResult] = []
        self._last_dex_results: list[DexSpreadResult] = []
        self._last_funding_results: list[dict] = []

    async def start(self):
        """Start the alert engine loop"""
        self._running = True
        logger.info("Alert engine started")
        
        while self._running:
            try:
                await self._run_cycle()
            except Exception as e:
                logger.error(f"Alert engine cycle error: {e}", exc_info=True)
            
            await asyncio.sleep(settings.ALERT_CHECK_INTERVAL_SEC)

    def stop(self):
        self._running = False
        logger.info("Alert engine stopped")

    async def _run_cycle(self):
        """One full alert check cycle"""
        logger.debug("Alert engine: running cycle")

        # 1. Run scans (results will be cached by scanners)
        await self._refresh_scan_data()

        # 2. Get active alerts from DB
        try:
            alerts = await get_active_alerts()
        except Exception as e:
            logger.error(f"Failed to fetch active alerts: {e}")
            return

        if not alerts:
            return

        # 3. Check each alert
        check_tasks = [self._check_alert(alert) for alert in alerts]
        await asyncio.gather(*check_tasks, return_exceptions=True)

    async def _refresh_scan_data(self):
        """Refresh market data for all scan types"""
        try:
            results, _, _ = await run_cex_scan(
                min_spread_pct=settings.MIN_SPREAD_PCT,
                min_volume_24h=settings.MIN_VOLUME_24H,
                limit=200,
            )
            self._last_cex_results = results
        except Exception as e:
            logger.debug(f"CEX scan refresh error: {e}")

        try:
            results, _ = await run_futures_scan(min_spread_pct=0.1, limit=200)
            self._last_futures_results = results
        except Exception as e:
            logger.debug(f"Futures scan refresh error: {e}")

        try:
            results, _, _ = await run_dex_scan(min_spread_pct=0.5, limit=200)
            self._last_dex_results = results
        except Exception as e:
            logger.debug(f"DEX scan refresh error: {e}")

        try:
            results = await run_funding_rates_scan()
            self._last_funding_results = results
        except Exception as e:
            logger.debug(f"Funding rate refresh error: {e}")

    async def _check_alert(self, alert: dict):
        """Check if a single alert should fire"""
        alert_type = alert.get("alert_type")
        telegram_id = alert.get("telegram_id")
        alert_id = alert.get("id")

        if not all([alert_type, telegram_id, alert_id]):
            return

        # Cooldown check
        last_triggered = alert.get("last_triggered_at")
        if last_triggered:
            if isinstance(last_triggered, str):
                last_triggered = datetime.fromisoformat(
                    last_triggered.replace("Z", "+00:00")
                )
            cooldown = timedelta(minutes=alert.get("cooldown_minutes", 30))
            if datetime.now(timezone.utc) - last_triggered < cooldown:
                return  # Still in cooldown

        matching_spread = None

        if alert_type == "cex_spread":
            matching_spread = self._find_matching_cex(alert)

        elif alert_type == "futures_spread":
            matching_spread = self._find_matching_futures(alert)

        elif alert_type == "dex_spread":
            matching_spread = self._find_matching_dex(alert)

        elif alert_type == "funding_rate":
            matching_spread = self._find_matching_funding(alert)

        if matching_spread is None:
            return

        # Fire the alert
        logger.info(
            f"Alert {alert_id} triggered for user {telegram_id}: "
            f"{alert_type} - {matching_spread.get('symbol') or 'unknown'}"
        )

        spread_dict = matching_spread if isinstance(matching_spread, dict) else (
            matching_spread.model_dump()
        )

        sent = await send_alert_notification(
            telegram_id=telegram_id,
            alert_type=alert_type,
            spread_data=spread_dict,
            alert_config=alert,
        )

        if sent:
            await update_alert_triggered(alert_id)
            await log_alert_history(alert_id, telegram_id, "", spread_dict)

    def _find_matching_cex(self, alert: dict) -> Optional[SpreadResult]:
        """Find first CEX spread that matches alert criteria"""
        min_spread = alert.get("min_spread_pct", 1.0)
        min_vol = alert.get("min_volume_24h", 100_000.0)
        symbol_filter = alert.get("symbol")
        buy_filter = alert.get("exchange_buy")
        sell_filter = alert.get("exchange_sell")

        for spread in self._last_cex_results:
            if spread.spread_pct < min_spread:
                continue
            if min_vol and (spread.min_volume_24h or 0) < min_vol:
                continue
            if symbol_filter and spread.symbol != symbol_filter:
                continue
            if buy_filter and spread.exchange_buy != buy_filter:
                continue
            if sell_filter and spread.exchange_sell != sell_filter:
                continue
            return spread

        return None

    def _find_matching_futures(self, alert: dict) -> Optional[FuturesSpreadResult]:
        """Find first futures spread that matches alert criteria"""
        min_spread = alert.get("min_spread_pct", 0.3)
        symbol_filter = alert.get("symbol")

        for spread in self._last_futures_results:
            if abs(spread.spread_pct) < min_spread:
                continue
            if symbol_filter and spread.symbol != symbol_filter:
                continue
            return spread

        return None

    def _find_matching_dex(self, alert: dict) -> Optional[DexSpreadResult]:
        """Find first DEX spread that matches alert criteria"""
        min_spread = alert.get("min_spread_pct", 2.0)
        symbol_filter = alert.get("symbol")

        for spread in self._last_dex_results:
            if spread.spread_pct < min_spread:
                continue
            if symbol_filter and not spread.symbol.startswith(symbol_filter.split("/")[0]):
                continue
            return spread

        return None

    def _find_matching_funding(self, alert: dict) -> Optional[dict]:
        """Find funding rate that exceeds threshold"""
        max_rate = alert.get("max_funding_rate") or alert.get("min_spread_pct", 0.1)
        symbol_filter = alert.get("symbol")
        exchange_filter = alert.get("exchange_buy") or alert.get("exchange_sell")

        for funding in self._last_funding_results:
            rate = abs(funding.get("funding_rate", 0))
            if rate < max_rate:
                continue
            if symbol_filter and funding.get("symbol") != symbol_filter:
                continue
            if exchange_filter and funding.get("exchange") != exchange_filter:
                continue
            return funding

        return None


# ── Singleton ─────────────────────────────────────────────────────────────────
_alert_engine: AlertEngine | None = None


def get_alert_engine() -> AlertEngine:
    global _alert_engine
    if _alert_engine is None:
        _alert_engine = AlertEngine()
    return _alert_engine
