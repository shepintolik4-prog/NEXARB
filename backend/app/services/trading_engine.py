"""
NEXARB Scanner v2 - Trading Engine
"""
import asyncio
import ccxt.async_support as ccxt
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


class TradingEngine:
    async def get_balance(self, exchange_id, api_key, api_secret, passphrase=None, currency="USDT"):
        try:
            ex = self._create_exchange(exchange_id, api_key, api_secret, passphrase)
            balance = await ex.fetch_balance()
            await ex.close()
            return float(balance.get(currency, {}).get("free", 0))
        except Exception as e:
            logger.error(f"get_balance error {exchange_id}: {e}")
            return None

    async def calculate_trade(self, symbol, exchange_buy_id, exchange_sell_id,
                               price_buy, price_sell, amount_usdt, api_keys):
        spread_pct = (price_sell - price_buy) / price_buy * 100
        fee_usd = amount_usdt * 0.002
        amount_base = amount_usdt / price_buy
        proceeds = amount_base * price_sell
        gross_profit = proceeds - amount_usdt
        net_profit = gross_profit - fee_usd
        net_profit_pct = (net_profit / amount_usdt) * 100
        balance_buy = None
        if api_keys.get(exchange_buy_id):
            keys = api_keys[exchange_buy_id]
            balance_buy = await self.get_balance(exchange_buy_id, keys.get("key",""), keys.get("secret",""), keys.get("passphrase"), "USDT")
        warning = None
        if net_profit_pct < 0.1:
            warning = "Net profit after fees is very low"
        elif balance_buy is not None and balance_buy < amount_usdt:
            warning = f"Insufficient balance: ${balance_buy:.2f} available"
        return {"symbol": symbol, "exchange_buy": exchange_buy_id, "exchange_sell": exchange_sell_id,
                "price_buy": price_buy, "price_sell": price_sell, "spread_pct": round(spread_pct, 4),
                "amount_usdt": amount_usdt, "amount_base": round(amount_base, 8),
                "proceeds_usdt": round(proceeds, 4), "fee_usdt": round(fee_usd, 4),
                "gross_profit_usdt": round(gross_profit, 4), "net_profit_usdt": round(net_profit, 4),
                "net_profit_pct": round(net_profit_pct, 4), "balance_buy_available": balance_buy,
                "is_profitable": net_profit > 0, "warning": warning}

    async def execute_trade(self, trade_id, telegram_id, symbol, exchange_buy_id,
                             exchange_sell_id, amount_base, api_keys):
        from app.database import get_supabase_service
        db = get_supabase_service()
        try:
            db.table("trades").update({"status": "executing",
                "confirmed_at": datetime.now(timezone.utc).isoformat()}).eq("id", trade_id).execute()
            keys_buy  = api_keys.get(exchange_buy_id, {})
            keys_sell = api_keys.get(exchange_sell_id, {})
            ex_buy  = self._create_exchange(exchange_buy_id,  keys_buy.get("key",""),  keys_buy.get("secret",""),  keys_buy.get("passphrase"))
            ex_sell = self._create_exchange(exchange_sell_id, keys_sell.get("key",""), keys_sell.get("secret",""), keys_sell.get("passphrase"))
            results = await asyncio.gather(
                ex_buy.create_market_buy_order(symbol, amount_base),
                ex_sell.create_market_sell_order(symbol, amount_base),
                return_exceptions=True)
            await asyncio.gather(ex_buy.close(), ex_sell.close(), return_exceptions=True)
            if isinstance(results[0], Exception): raise Exception(f"Buy failed: {results[0]}")
            if isinstance(results[1], Exception): raise Exception(f"Sell failed: {results[1]}")
            cost = float(results[0].get("cost", 0))
            proceeds = float(results[1].get("cost", 0))
            fee = float(results[0].get("fee", {}).get("cost", 0)) + float(results[1].get("fee", {}).get("cost", 0))
            profit = proceeds - cost - fee
            db.table("trades").update({"status": "completed", "order_id_buy": results[0].get("id"),
                "order_id_sell": results[1].get("id"), "profit_usd": round(profit+fee, 6),
                "fee_usd": round(fee, 6), "net_profit_usd": round(profit, 6),
                "completed_at": datetime.now(timezone.utc).isoformat()}).eq("id", trade_id).execute()
            return {"success": True, "trade_id": trade_id, "net_profit_usd": round(profit, 4)}
        except Exception as e:
            logger.error(f"execute_trade error: {e}")
            db.table("trades").update({"status": "failed", "error_message": str(e)[:500]}).eq("id", trade_id).execute()
            return {"success": False, "error": str(e), "trade_id": trade_id}

    def _create_exchange(self, exchange_id, api_key, api_secret, passphrase=None):
        exchange_class = getattr(ccxt, exchange_id)
        config = {"apiKey": api_key, "secret": api_secret, "enableRateLimit": True,
                  "timeout": 10000, "options": {"defaultType": "spot"}}
        if passphrase:
            config["password"] = passphrase
        return exchange_class(config)

    async def get_trade_history(self, telegram_id: int, limit: int = 20) -> list:
        from app.database import get_supabase_service
        db = get_supabase_service()
        result = db.table("trades").select("*").eq("telegram_id", telegram_id
            ).order("created_at", desc=True).limit(limit).execute()
        return result.data or []


_trading_engine = None


def get_trading_engine() -> TradingEngine:
    global _trading_engine
    if _trading_engine is None:
        _trading_engine = TradingEngine()
    return _trading_engine