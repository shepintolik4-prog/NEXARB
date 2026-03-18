"""
NEXARB Scanner v2 - Trading Engine
Semi-automatic arbitrage execution via user API keys
Phase 1: Show trade → user confirms → execute
"""
import asyncio
import ccxt.async_support as ccxt
import logging
from datetime import datetime, timezone
from typing import Optional
from decimal import Decimal

logger = logging.getLogger(__name__)


class TradingEngine:
    """
    Executes arbitrage trades using user-provided API keys.
    SEMI-AUTO: always requires user confirmation before placing orders.
    """

    async def get_balance(
        self,
        exchange_id: str,
        api_key: str,
        api_secret: str,
        passphrase: str = None,
        currency: str = "USDT",
    ) -> Optional[float]:
        """Get available balance for a currency"""
        try:
            ex = self._create_exchange(exchange_id, api_key, api_secret, passphrase)
            balance = await ex.fetch_balance()
            await ex.close()
            return float(balance.get(currency, {}).get("free", 0))
        except Exception as e:
            logger.error(f"get_balance error {exchange_id}: {e}")
            return None

    async def calculate_trade(
        self,
        symbol: str,
        exchange_buy_id: str,
        exchange_sell_id: str,
        price_buy: float,
        price_sell: float,
        amount_usdt: float,
        api_keys: dict,
    ) -> dict:
        """
        Calculate trade details before execution.
        Returns full breakdown: amounts, fees, expected profit.
        """
        spread_pct = (price_sell - price_buy) / price_buy * 100

        # Estimate fees (0.1% per side = 0.2% total)
        fee_pct = 0.2
        fee_usd = amount_usdt * (fee_pct / 100)

        # Amount of base asset to buy
        amount_base = amount_usdt / price_buy

        # Expected proceeds from sell
        proceeds = amount_base * price_sell

        # Gross profit
        gross_profit = proceeds - amount_usdt
        net_profit = gross_profit - fee_usd
        net_profit_pct = (net_profit / amount_usdt) * 100

        # Check balances if keys provided
        balance_buy = None
        balance_sell = None
        if api_keys.get(exchange_buy_id):
            keys = api_keys[exchange_buy_id]
            balance_buy = await self.get_balance(
                exchange_buy_id,
                keys.get("key", ""),
                keys.get("secret", ""),
                keys.get("passphrase"),
                "USDT",
            )

        return {
            "symbol": symbol,
            "exchange_buy": exchange_buy_id,
            "exchange_sell": exchange_sell_id,
            "price_buy": price_buy,
            "price_sell": price_sell,
            "spread_pct": round(spread_pct, 4),
            "amount_usdt": amount_usdt,
            "amount_base": round(amount_base, 8),
            "proceeds_usdt": round(proceeds, 4),
            "fee_usdt": round(fee_usd, 4),
            "gross_profit_usdt": round(gross_profit, 4),
            "net_profit_usdt": round(net_profit, 4),
            "net_profit_pct": round(net_profit_pct, 4),
            "balance_buy_available": balance_buy,
            "is_profitable": net_profit > 0,
            "warning": self._get_warning(net_profit_pct, balance_buy, amount_usdt),
        }

    def _get_warning(self, net_pct: float, balance: float, amount: float) -> Optional[str]:
        if net_pct < 0.1:
            return "⚠️ Net profit after fees is very low"
        if balance is not None and balance < amount:
            return f"⚠️ Insufficient balance: ${balance:.2f} available, ${amount:.2f} needed"
        return None

    async def execute_trade(
        self,
        trade_id: str,
        telegram_id: int,
        symbol: str,
        exchange_buy_id: str,
        exchange_sell_id: str,
        amount_base: float,
        api_keys: dict,
    ) -> dict:
        """
        Execute both legs of the arbitrage trade simultaneously.
        Called ONLY after user confirms in TMA.
        """
        db = None
        try:
            from app.database import get_supabase_service
            db = get_supabase_service()

            # Update status to executing
            db.table("trades").update({
                "status": "executing",
                "confirmed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", trade_id).execute()

            # Create exchange instances
            keys_buy = api_keys.get(exchange_buy_id, {})
            keys_sell = api_keys.get(exchange_sell_id, {})

            ex_buy = self._create_exchange(
                exchange_buy_id,
                keys_buy.get("key", ""),
                keys_buy.get("secret", ""),
                keys_buy.get("passphrase"),
            )
            ex_sell = self._create_exchange(
                exchange_sell_id,
                keys_sell.get("key", ""),
                keys_sell.get("secret", ""),
                keys_sell.get("passphrase"),
            )

            # Execute both orders simultaneously
            buy_task = ex_buy.create_market_buy_order(symbol, amount_base)
            sell_task = ex_sell.create_market_sell_order(symbol, amount_base)

            results = await asyncio.gather(buy_task, sell_task, return_exceptions=True)

            buy_result = results[0]
            sell_result = results[1]

            # Close exchanges
            await asyncio.gather(ex_buy.close(), ex_sell.close(), return_exceptions=True)

            # Check for errors
            if isinstance(buy_result, Exception):
                raise Exception(f"Buy order failed: {buy_result}")
            if isinstance(sell_result, Exception):
                raise Exception(f"Sell order failed: {sell_result}")

            order_id_buy = buy_result.get("id")
            order_id_sell = sell_result.get("id")

            # Calculate actual profit
            actual_cost = float(buy_result.get("cost", 0))
            actual_proceeds = float(sell_result.get("cost", 0))
            actual_fee = float(buy_result.get("fee", {}).get("cost", 0)) + \
                         float(sell_result.get("fee", {}).get("cost", 0))
            profit = actual_proceeds - actual_cost - actual_fee

            # Update trade record
            db.table("trades").update({
                "status": "completed",
                "order_id_buy": order_id_buy,
                "order_id_sell": order_id_sell,
                "profit_usd": round(profit + actual_fee, 6),
                "fee_usd": round(actual_fee, 6),
                "net_profit_usd": round(profit, 6),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", trade_id).execute()

            # Update user total profit
            db.table("users").update({
                "total_profit_usd": db.raw(f"total_profit_usd + {profit}"),
                "total_trades": db.raw("total_trades + 1"),
            }).eq("telegram_id", telegram_id).execute()

            return {
                "success": True,
                "trade_id": trade_id,
                "order_id_buy": order_id_buy,
                "order_id_sell": order_id_sell,
                "net_profit_usd": round(profit, 4),
            }

        except Exception as e:
            logger.error(f"execute_trade error: {e}")
            if db:
                db.table("trades").update({
                    "status": "failed",
                    "error_message": str(e)[:500],
                }).eq("id", trade_id).execute()

            return {
                "success": False,
                "error": str(e),
                "trade_id": trade_id,
            }

    def _create_exchange(
        self,
        exchange_id: str,
        api_key: str,
        api_secret: str,
        passphrase: str = None,
    ) -> ccxt.Exchange:
        exchange_class = getattr(ccxt, exchange_id)
        config = {
            "apiKey": api_key,
            "secret": api_secret,
            "enableRateLimit": True,
            "timeout": 10000,
            "options": {"defaultType": "spot"},
        }
        if passphrase:
            config["password"] = passphrase
        return exchange_class(config)

    async def get_trade_history(self, telegram_id: int, limit: int = 20) -> list[dict]:
        from app.database import get_supabase_service
        db = get_supabase_service()
        result = db.table("trades").select("*").eq(
            "telegram_id", telegram_id
        ).order("created_at", desc=True).limit(limit).execute()
        return result.data or []


# Singleton
_trading_engine: TradingEngine | None = None


def get_trading_engine() -> TradingEngine:
    global _trading_engine
    if _trading_engine is None:
        _trading_engine = TradingEngine()
    return _trading_engine
