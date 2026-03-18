"""
NEXARB Scanner v2 - Trading Router
Semi-automatic arbitrage execution
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.trading_engine import get_trading_engine
from app.services.subscription import check_module_access, get_user_tier
from app.database import get_supabase_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/trading", tags=["Trading"])


class CalculateTradeRequest(BaseModel):
    telegram_id: int
    symbol: str
    exchange_buy: str
    exchange_sell: str
    price_buy: float
    price_sell: float
    amount_usdt: float = 100.0


class ConfirmTradeRequest(BaseModel):
    telegram_id: int
    symbol: str
    exchange_buy: str
    exchange_sell: str
    price_buy: float
    price_sell: float
    amount_usdt: float
    # API keys from user settings (passed from frontend)
    # In production these should come from encrypted DB storage
    api_keys: dict  # {exchange_id: {key, secret, passphrase?}}


@router.post("/calculate")
async def calculate_trade(req: CalculateTradeRequest):
    """
    Calculate trade details before execution.
    Shows expected profit, fees, required balance.
    No VIP required — anyone can see calculations.
    """
    engine = get_trading_engine()
    result = await engine.calculate_trade(
        symbol=req.symbol,
        exchange_buy_id=req.exchange_buy,
        exchange_sell_id=req.exchange_sell,
        price_buy=req.price_buy,
        price_sell=req.price_sell,
        amount_usdt=req.amount_usdt,
        api_keys={},
    )
    return result


@router.post("/confirm-execute")
async def confirm_and_execute(req: ConfirmTradeRequest):
    """
    Execute trade after user confirmation.
    VIP only. Requires valid API keys for both exchanges.
    """
    # Check VIP access
    has_access = await check_module_access(req.telegram_id, "trading")
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="VIP subscription required for auto-trading"
        )

    # Validate API keys provided
    if not req.api_keys.get(req.exchange_buy) or not req.api_keys.get(req.exchange_sell):
        raise HTTPException(
            status_code=400,
            detail=f"API keys required for {req.exchange_buy} and {req.exchange_sell}"
        )

    engine = get_trading_engine()
    db = get_supabase_service()

    # Calculate trade first
    calc = await engine.calculate_trade(
        symbol=req.symbol,
        exchange_buy_id=req.exchange_buy,
        exchange_sell_id=req.exchange_sell,
        price_buy=req.price_buy,
        price_sell=req.price_sell,
        amount_usdt=req.amount_usdt,
        api_keys=req.api_keys,
    )

    if not calc["is_profitable"]:
        raise HTTPException(
            status_code=400,
            detail="Trade is not profitable after fees"
        )

    # Create trade record
    trade_record = db.table("trades").insert({
        "telegram_id": req.telegram_id,
        "symbol": req.symbol,
        "exchange_buy": req.exchange_buy,
        "exchange_sell": req.exchange_sell,
        "price_buy": req.price_buy,
        "price_sell": req.price_sell,
        "amount": calc["amount_base"],
        "spread_pct": calc["spread_pct"],
        "status": "confirmed",
    }).execute()

    trade_id = trade_record.data[0]["id"]

    # Execute
    result = await engine.execute_trade(
        trade_id=trade_id,
        telegram_id=req.telegram_id,
        symbol=req.symbol,
        exchange_buy_id=req.exchange_buy,
        exchange_sell_id=req.exchange_sell,
        amount_base=calc["amount_base"],
        api_keys=req.api_keys,
    )

    # Notify via Telegram
    if result["success"]:
        try:
            from app.services.telegram_bot import get_bot
            from telegram.constants import ParseMode
            bot = get_bot()
            profit = result.get("net_profit_usd", 0)
            await bot.send_message(
                chat_id=req.telegram_id,
                text=(
                    f"{'✅' if profit > 0 else '⚠️'} <b>Trade Executed</b>\n\n"
                    f"💎 {req.symbol}\n"
                    f"🟢 Bought on {req.exchange_buy.upper()}\n"
                    f"🔴 Sold on {req.exchange_sell.upper()}\n\n"
                    f"💰 Net Profit: <code>${profit:+.4f}</code>\n"
                    f"🆔 Trade ID: <code>{trade_id[:8]}</code>"
                ),
                parse_mode=ParseMode.HTML,
            )
        except Exception as e:
            logger.error(f"Trade notification error: {e}")

    return result


@router.get("/{telegram_id}/history")
async def get_trade_history(telegram_id: int, limit: int = 20):
    """Get user's trade history"""
    engine = get_trading_engine()
    trades = await engine.get_trade_history(telegram_id, limit)
    return {"data": trades, "total": len(trades)}


@router.get("/{telegram_id}/stats")
async def get_trading_stats(telegram_id: int):
    """Get user's trading statistics"""
    db = get_supabase_service()
    user = db.table("users").select(
        "total_trades, total_profit_usd"
    ).eq("telegram_id", telegram_id).execute()

    if not user.data:
        return {"total_trades": 0, "total_profit_usd": 0}

    trades = db.table("trades").select("status, net_profit_usd").eq(
        "telegram_id", telegram_id
    ).execute()

    completed = [t for t in (trades.data or []) if t["status"] == "completed"]
    profitable = [t for t in completed if (t.get("net_profit_usd") or 0) > 0]

    return {
        "total_trades": len(completed),
        "total_profit_usd": sum(t.get("net_profit_usd", 0) or 0 for t in completed),
        "win_rate": len(profitable) / len(completed) * 100 if completed else 0,
        "best_trade": max((t.get("net_profit_usd", 0) or 0 for t in completed), default=0),
    }
